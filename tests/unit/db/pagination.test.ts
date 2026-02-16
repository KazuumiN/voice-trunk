import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  parsePaginationParams,
  buildPaginatedQuery,
  processPaginatedResults,
} from "../../../src/lib/server/db/pagination.js";

describe("cursor encode/decode round-trip", () => {
  it("should encode and decode a cursor correctly", () => {
    const sortValue = "2026-02-15T00:00:00.000Z";
    const id = "recfile-abc123xyz";

    const encoded = encodeCursor(sortValue, id);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeCursor(encoded);
    expect(decoded.sortValue).toBe(sortValue);
    expect(decoded.id).toBe(id);
  });

  it("should handle special characters in sort values", () => {
    const sortValue = "test value with spaces & symbols!";
    const id = "ws-123abc";

    const encoded = encodeCursor(sortValue, id);
    const decoded = decodeCursor(encoded);
    expect(decoded.sortValue).toBe(sortValue);
    expect(decoded.id).toBe(id);
  });

  it("should throw on invalid cursor", () => {
    expect(() => decodeCursor("not-valid-base64!@#")).toThrow("Invalid cursor");
  });

  it("should throw on cursor with missing fields", () => {
    const bad = btoa(JSON.stringify({ sortValue: "abc" }));
    expect(() => decodeCursor(bad)).toThrow("Invalid cursor structure");
  });

  it("should throw on cursor with wrong field types", () => {
    const bad = btoa(JSON.stringify({ sortValue: 123, id: "abc" }));
    expect(() => decodeCursor(bad)).toThrow("Invalid cursor structure");
  });
});

describe("parsePaginationParams", () => {
  it("should use defaults when no params provided", () => {
    const result = parsePaginationParams({});
    expect(result.limit).toBe(50);
    expect(result.cursor).toBeNull();
    expect(result.sortField).toBe("createdAt");
    expect(result.sortDir).toBe("DESC");
  });

  it("should parse limit as string", () => {
    const result = parsePaginationParams({ limit: "25" });
    expect(result.limit).toBe(25);
  });

  it("should parse limit as number", () => {
    const result = parsePaginationParams({ limit: 30 });
    expect(result.limit).toBe(30);
  });

  it("should cap limit at MAX_LIMIT (200)", () => {
    const result = parsePaginationParams({ limit: 500 });
    expect(result.limit).toBe(200);
  });

  it("should handle invalid limit gracefully", () => {
    const result = parsePaginationParams({ limit: "invalid" });
    expect(result.limit).toBe(50);
  });

  it("should parse sort ascending", () => {
    const result = parsePaginationParams({ sort: "date:asc" });
    expect(result.sortField).toBe("date");
    expect(result.sortDir).toBe("ASC");
  });

  it("should parse sort descending", () => {
    const result = parsePaginationParams({ sort: "title:desc" });
    expect(result.sortField).toBe("title");
    expect(result.sortDir).toBe("DESC");
  });

  it("should default to DESC when sort direction missing", () => {
    const result = parsePaginationParams({ sort: "name" });
    expect(result.sortField).toBe("name");
    expect(result.sortDir).toBe("DESC");
  });

  it("should decode cursor from params", () => {
    const cursor = encodeCursor("2026-01-01", "rec-abc");
    const result = parsePaginationParams({ cursor });
    expect(result.cursor).not.toBeNull();
    expect(result.cursor!.sortValue).toBe("2026-01-01");
    expect(result.cursor!.id).toBe("rec-abc");
  });
});

describe("buildPaginatedQuery", () => {
  it("should build query without cursor", () => {
    const result = buildPaginatedQuery({
      sortField: "createdAt",
      sortDir: "DESC",
      cursor: null,
      limit: 50,
    });

    expect(result.whereClause).toBe("");
    expect(result.orderClause).toBe("ORDER BY createdAt DESC, id DESC");
    expect(result.limitClause).toBe("LIMIT ?");
    expect(result.cursorParams).toEqual([51]); // limit + 1
  });

  it("should build query with cursor for DESC", () => {
    const result = buildPaginatedQuery({
      sortField: "createdAt",
      sortDir: "DESC",
      cursor: { sortValue: "2026-01-01", id: "rec-abc" },
      limit: 10,
    });

    expect(result.whereClause).toBe(
      "AND (createdAt < ? OR (createdAt = ? AND id < ?))",
    );
    expect(result.cursorParams).toEqual([
      "2026-01-01",
      "2026-01-01",
      "rec-abc",
      11,
    ]);
  });

  it("should build query with cursor for ASC", () => {
    const result = buildPaginatedQuery({
      sortField: "date",
      sortDir: "ASC",
      cursor: { sortValue: "2026-06-01", id: "ws-xyz" },
      limit: 20,
    });

    expect(result.whereClause).toBe(
      "AND (date > ? OR (date = ? AND id > ?))",
    );
    expect(result.orderClause).toBe("ORDER BY date ASC, id ASC");
  });
});

describe("processPaginatedResults", () => {
  it("should detect hasMore when results exceed limit", () => {
    const rows = [
      { id: "1", createdAt: "a" },
      { id: "2", createdAt: "b" },
      { id: "3", createdAt: "c" },
    ];

    const result = processPaginatedResults(rows, 2, "createdAt");
    expect(result.hasMore).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
  });

  it("should not have hasMore when results fit in limit", () => {
    const rows = [
      { id: "1", createdAt: "a" },
      { id: "2", createdAt: "b" },
    ];

    const result = processPaginatedResults(rows, 2, "createdAt");
    expect(result.hasMore).toBe(false);
    expect(result.data).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it("should handle empty results", () => {
    const result = processPaginatedResults([], 10, "createdAt");
    expect(result.hasMore).toBe(false);
    expect(result.data).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("should encode cursor from last row", () => {
    const rows = [
      { id: "1", createdAt: "a" },
      { id: "2", createdAt: "b" },
      { id: "3", createdAt: "c" },
    ];

    const result = processPaginatedResults(rows, 2, "createdAt");
    expect(result.nextCursor).not.toBeNull();

    const decoded = decodeCursor(result.nextCursor!);
    expect(decoded.sortValue).toBe("b");
    expect(decoded.id).toBe("2");
  });
});
