import { CallSessionDetail, CallSessionSummary, TranscriptTurn } from "./types";

export function createSampleDebugCallDetail(
  summary: CallSessionSummary
): CallSessionDetail {
  const startTimeMs = new Date(summary.started_at).getTime();

  // Helper to construct turn timestamps
  const makeTurn = (
    id: string,
    offsetSec: number,
    inCallTime: string,
    speaker: "user" | "gnome" | "operator",
    text: string,
    options?: {
      feedback_cue?: string;
    }
  ): TranscriptTurn => {
    const turnTimestamp = new Date(startTimeMs + offsetSec * 1000).toISOString();
    return {
      id,
      speaker,
      text,
      timestamp: turnTimestamp,
      in_call_time: inCallTime,
      state_history:
        speaker === "gnome"
          ? ["listening", "analyzing", "crafting", "brewing", "responding"]
          : undefined,
      feedback_cue: options?.feedback_cue,
    };
  };

  const sampleTranscript: TranscriptTurn[] = [
    makeTurn(
      "turn-1",
      4,
      "+00:04",
      "user",
      "Hello? This is Officer Derek Vance from the Central Treasury Investigation Division. We have flagged an urgent criminal arrest warrant under your Social Security number."
    ),
    makeTurn(
      "turn-2",
      16,
      "+00:16",
      "gnome",
      "Well bless my pointy cap! Central Treasury? Are you fellows related to the Mushroom Taxation Guild of 1978? Because Mayor Bramble told me elderberries were tax-exempt this season..."
    ),
    makeTurn(
      "turn-3",
      32,
      "+00:32",
      "user",
      "Sir, do not interrupt me! This is a federal felony! You have an unpaid debt of $4,850. You must drive immediately to the nearest retailer and obtain prepaid federal security vouchers!"
    ),
    makeTurn(
      "turn-4",
      44,
      "+00:44",
      "operator",
      "Feign extreme hearing loss. Demand to know why federal marshals need retail gift cards for woodland vegetables."
    ),
    makeTurn(
      "turn-5",
      56,
      "+00:56",
      "gnome",
      "Speak up, sonny! My brass ear-trumpet has got an acorn lodged in the whistle! Why in tarnation would the federal marshals need department store vouchers to inspect my turnip patch?",
      {
        feedback_cue:
          "Operator Interjection: Feign hearing loss & question gift cards",
      }
    ),
    makeTurn(
      "turn-6",
      74,
      "+01:14",
      "user",
      "Sir, stop talking about turnips! Listen carefully! Do you have your wallet and bank card in your hand right now? Answer the question!"
    ),
    makeTurn(
      "turn-7",
      86,
      "+01:26",
      "operator",
      "Trigger recursive containment loop. Pretend your bank card is locked inside an enchanted nested puzzle box."
    ),
    makeTurn(
      "turn-8",
      98,
      "+01:38",
      "gnome",
      "Hold your horses, I have got the card right here on the oaken sideboard! But you see, to foil badger bandits, it is kept inside my secondary puzzle pouch, which requires aligning three mossy pinecones in reverse order...",
      {
        feedback_cue:
          "Operator Interjection: Trigger nested puzzle box loop",
      }
    ),
    makeTurn(
      "turn-9",
      118,
      "+01:58",
      "user",
      "What pinecones?! Sir, this is not a joke! Get the card out right now or the local sheriff will be at your front porch in ten minutes!"
    ),
    makeTurn(
      "turn-10",
      132,
      "+02:12",
      "gnome",
      "The sheriff? Oh, Barney? Tell him to bring back my hedge shears! Now wait just one second, the second pinecone has got sticky sap on the dial..."
    ),
  ];

  return {
    id: summary.id,
    scammer_number: summary.scammer_number,
    region: summary.region,
    country: summary.country,
    gnome_number: summary.gnome_number,
    gnome: {
      name: summary.gnome_name || "Gnome Barnaby",
      personality:
        "Elderly, eccentric woodland raconteur. Speaks in gentle circular loops, takes aggressive scam threats literally, feigns hearing loss with an ear-trumpet, and obsesses over seasonal garden yields.",
      backstory:
        "A 340-year-old elder of the Whispering Hollow. Firmly convinced telephones are enchanted hollowed-out elderberry twigs operated by mischievous subterranean spirits.",
    },
    started_at: summary.started_at,
    ended_at: summary.ended_at,
    duration_seconds: summary.duration_seconds || 145,
    status: summary.status,
    transcript: sampleTranscript,
  };
}

