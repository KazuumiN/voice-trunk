import { getWorkshops } from "$lib/api/client.js";
import type { PageLoad } from "./$types.js";

export const load: PageLoad = async ({ url }) => {
  try {
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
    const dateTo = url.searchParams.get("dateTo") ?? undefined;
    const location = url.searchParams.get("location") ?? undefined;
    const data = await getWorkshops({ cursor, dateFrom, dateTo, location });
    return { workshops: data.data, pagination: data.pagination, error: null };
  } catch (err) {
    return {
      workshops: [],
      pagination: { hasMore: false, nextCursor: null, totalCount: 0 },
      error: err instanceof Error ? err.message : "ワークショップ一覧の読み込みに失敗しました",
    };
  }
};
