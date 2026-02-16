import { getWorkshopDraft, getRecordings } from "$lib/api/client.js";
import type { PageLoad } from "./$types.js";

export const load: PageLoad = async ({ params }) => {
  try {
    const [draft, recordings] = await Promise.all([
      getWorkshopDraft(params.id),
      getRecordings({ draftId: params.id, limit: 100 }),
    ]);
    return { draftId: params.id, draft, recordings: recordings.data, error: null };
  } catch (err) {
    return {
      draftId: params.id,
      draft: null,
      recordings: [],
      error: err instanceof Error ? err.message : "ドラフトの読み込みに失敗しました",
    };
  }
};
