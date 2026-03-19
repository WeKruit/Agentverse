/**
 * Common types for the profile extraction pipeline.
 */

export interface NormalizedMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  source: "claude-code" | "chatgpt";
  metadata?: {
    sessionId?: string;
    cwd?: string;
    gitBranch?: string;
    conversationId?: string;
  };
}

export interface NormalizedConversation {
  id: string;
  messages: NormalizedMessage[];
  source: "claude-code" | "chatgpt";
  startTime: number;
  endTime: number;
}

export interface SkillEntry {
  name: string;
  confidence: number;
  mentions: number;
  firstSeen: string;
  lastSeen: string;
  source: "explicit" | "inferred" | "behavioral" | "llm-extracted";
  proficiency?: string;
  evidence?: string[];
}

export interface InterestEntry {
  topic: string;
  confidence: number;
  mentions: number;
}

export interface CommunicationStyle {
  verbosity: "concise" | "moderate" | "verbose";
  formality: "casual" | "professional" | "formal";
  technicalDepth: "beginner" | "intermediate" | "advanced" | "expert";
}

export interface CareerContext {
  currentRole?: string;
  industry?: string;
  careerStage: "student" | "early-career" | "mid-career" | "senior" | "executive";
  teamContext?: string;
  domains?: string[];
}

export interface DemographicsEntry {
  locationGeneral?: string;
  ageRange?: string;
  spokenLanguages: string[];
}

export interface ExtractedProfile {
  skills: SkillEntry[];
  interests: InterestEntry[];
  communication: CommunicationStyle;
  values: string[];
  career: CareerContext;
  demographics: DemographicsEntry;
  metadata: {
    extractedAt: string;
    conversationCount: number;
    sourceBreakdown: Record<string, number>;
    extractionMethod?: "keyword" | "llm";
    chunksProcessed?: number;
    about?: string;
    totalTokensProcessed?: number;
  };
}
