import { getRecordings } from "$lib/api/client.js";
import type { PageLoad } from "./$types.js";

export const load: PageLoad = async ({ params }) => {
  try {
    const recordings = await getRecordings({ batchId: params.id, limit: 200 });
    return { batchId: params.id, recordings: recordings.data, pagination: recordings.pagination, error: null };
  } catch (err) {
    return {
      batchId: params.id,
      recordings: [],
      pagination: { hasMore: false, nextCursor: null, totalCount: 0 },
      error: err instanceof Error ? err.message : "バッチ詳細の読み込みに失敗しました",
    };
  }
};
