// types.ts
export interface RecordingHistory {
    id: string;
    date: string;
    duration: number;
    uri: string;
    transcription: string;
    analysis: AnalysisResult;
  }

  // Types for the analysis result
 export interface AnalysisMetrics {
    wordCount: number;
    sentenceCount: number;
    avgWordsPerSentence: string;
  }
  
  export interface AnalysisResult {
    score: string;
    feedback: string;
    metrics: AnalysisMetrics;
  }
  