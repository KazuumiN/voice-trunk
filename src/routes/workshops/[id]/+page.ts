import { getWorkshop, getRecordings } from "$lib/api/client.js";
import type { PageLoad } from "./$types.js";

export const load: PageLoad = async ({ params }) => {
  try {
    const [workshop, recordings] = await Promise.all([
      getWorkshop(params.id),
      getRecordings({ workshopId: params.id, limit: 100 }),
    ]);
    return {
      workshop,
      recordings: recordings.data,
      pagination: recordings.pagination,
      error: null,
    };
  } catch (err) {
    return {
      workshop: null,
      recordings: [],
      pagination: { hasMore: false, nextCursor: null, totalCount: 0 },
      error: err instanceof Error ? err.message : "ワークショップの読み込みに失敗しました",
    };
  }
};
