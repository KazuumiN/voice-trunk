import { getWorkshopDrafts } from "$lib/api/client.js";
import type { PageLoad } from "./$types.js";

export const load: PageLoad = async ({ url }) => {
  try {
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const data = await getWorkshopDrafts({ cursor, status });
    return { drafts: data.data, pagination: data.pagination, error: null };
  } catch (err) {
    return {
      drafts: [],
      pagination: { hasMore: false, nextCursor: null, totalCount: 0 },
      error: err instanceof Error ? err.message : "ドラフト一覧の読み込みに失敗しました",
    };
  }
};
