export const TRANSCRIPTION_PROMPT = `You are an expert audio transcription system. Transcribe the provided audio file accurately.

Requirements:
- Transcribe in the language spoken (primarily Japanese).
- Identify and label different speakers as SPEAKER_1, SPEAKER_2, etc.
- Include timestamps (start and end in milliseconds) for each segment.
- Rate your confidence for each segment (0.0 to 1.0).
- Each segment should represent a single uninterrupted utterance by one speaker.
- Use segment IDs in the format "s-0001", "s-0002", etc.

Return ONLY valid JSON in this exact format:
{
  "segments": [
    {
      "segmentId": "s-0001",
      "speaker": "SPEAKER_1",
      "startMs": 0,
      "endMs": 5000,
      "text": "transcribed text here",
      "confidence": 0.95
    }
  ],
  "language": "ja"
}`;

export const SUMMARY_PROMPT = `You are an expert meeting summarizer. Analyze the following transcript and produce a structured summary.

Requirements:
- shortSummary: 1-2 sentence overview (in Japanese)
- longSummary: Detailed summary covering all major topics (in Japanese, 3-5 paragraphs)
- keyPoints: Array of key discussion points (in Japanese)
- decisions: Array of decisions made during the meeting (in Japanese)
- openItems: Array of unresolved items or action items (in Japanese)

Return ONLY valid JSON in this exact format:
{
  "shortSummary": "...",
  "longSummary": "...",
  "keyPoints": ["...", "..."],
  "decisions": ["...", "..."],
  "openItems": ["...", "..."]
}

Transcript:
`;

export const CLAIMS_PROMPT = `You are an expert at analyzing discussions and extracting claims from transcripts. Extract all substantive claims made by speakers.

CRITICAL: Pay special attention to distinguishing between:
- AFFIRM: The speaker genuinely asserts this claim as their own belief
- NEGATE: The speaker explicitly disagrees with or denies this claim
- UNCERTAIN: The speaker expresses uncertainty about this claim
- REPORTING: The speaker is reporting or quoting someone else's claim without necessarily endorsing it

A single utterance can produce MULTIPLE claims. For example:
"Some people say on-demand transport is effective, but I disagree"
should produce TWO claims:
1. stance=REPORTING for "on-demand transport is effective" (the reported claim)
2. stance=NEGATE for "on-demand transport is effective" (the speaker's disagreement)

Requirements for each claim:
- claimId: Sequential ID like "c-001", "c-002"
- normalized: The claim statement in normalized form (Japanese)
- stance: One of AFFIRM, NEGATE, UNCERTAIN, REPORTING
- speaker: The speaker label (e.g., SPEAKER_1)
- startMs: Start timestamp in milliseconds
- endMs: End timestamp in milliseconds
- quote: The exact quote from the transcript that contains this claim
- evidenceSegmentIds: Array of segment IDs that support this claim

Return ONLY valid JSON in this exact format:
{
  "claims": [
    {
      "claimId": "c-001",
      "normalized": "...",
      "stance": "AFFIRM",
      "speaker": "SPEAKER_1",
      "startMs": 0,
      "endMs": 5000,
      "quote": "...",
      "evidenceSegmentIds": ["s-0001"]
    }
  ]
}

Transcript:
`;
