// App.tsx
import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dashboard } from './components/Dashboard';
import { Platform } from 'react-native';
import { AnalysisResult, RecordingHistory } from './types';
import { usePermissions } from 'expo-permissions';

export default function App(): React.ReactElement {
  // State variables with proper types
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [transcriptionText, setTranscriptionText] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [permissionResponse, requestPermission] = Audio.usePermissions();
    // Add new state variables
    const [recordings, setRecordings] = useState<RecordingHistory[]>([]);
    const [showRecording, setShowRecording] = useState<boolean>(false);
    const [selectedRecording, setSelectedRecording] = 
      useState<RecordingHistory | null>(null);

  // Check and request permissions on component mount
  useEffect(() => {
    if (permissionResponse && !permissionResponse.granted) {
      requestPermission();
    }
  }, [permissionResponse]);

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      if (recording) {
        stopRecording();
      }
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [recording, timerInterval]);


  const resetRecordingState = () => {
    // Reset recording-related states
    setRecording(null);
    setIsRecording(false);
    setRecordingUri(null);
    setRecordingDuration(0);
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    
    // Reset analysis-related states
    setTranscriptionText('');
    setAnalysisResult(null);
    setIsLoading(false);
  };

  // Format seconds into mm:ss format
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Load recordings from storage on mount
  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      const stored = await AsyncStorage.getItem('recordings');
      if (stored) {
        setRecordings(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading recordings:', error);
    }
  };

  const saveRecording = async (newRecording: RecordingHistory) => {
    try {
      const updatedRecordings = [newRecording, ...recordings];
      await AsyncStorage.setItem(
        'recordings', 
        JSON.stringify(updatedRecordings)
      );
      setRecordings(updatedRecordings);
    } catch (error) {
      console.error('Error saving recording:', error);
    }
  };


  // Start recording function
  const startRecording = async (): Promise<void> => {
    try {
      // First ensure we're not already recording
      if (isRecording || recording) {
        console.log('Already recording, resetting state first');
        // Just reset state instead of calling stopRecording() to avoid potential recursion
        if (timerInterval) clearInterval(timerInterval);
        setTimerInterval(null);
        setIsRecording(false);
        setRecording(null);
        // Add a small delay to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Check permissions first
      if (!permissionResponse || !permissionResponse.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert('Permission Required', 'Audio recording permission is needed for this app to function');
          return;
        }
      }

      // Configure audio session with basic settings
      console.log("Setting audio mode...");
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: true  // Keep recording if app goes to background
      });

      console.log('Creating new recording...');
      // Use the standard preset options
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      console.log('Recording created successfully');
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start timer
      const interval = setInterval(() => {
        setRecordingDuration(prev => {
          // Auto-stop at 60 seconds
          if (prev >= 60) {
            console.log('Maximum recording time reached, stopping...');
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      
      setTimerInterval(interval);
      
    } catch (error) {
      console.error('Failed to start recording', error);
      Alert.alert('Error', 'Failed to start recording');
      // Clean up any partial state
      setIsRecording(false);
      setRecording(null);
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
    }
  };

  // Stop recording function
  const stopRecording = async (): Promise<void> => {
    // Early return if no active recording
    if (!recording) return;
    
    // Store a local reference to the current recording
    const currentRecording = recording;
    
    // Clear state variables first to prevent multiple stop attempts
    setIsRecording(false);
    setRecording(null);
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    
    try {
      console.log("Attempting to stop recording...");
      // Try to stop recording using the local reference
      await currentRecording.stopAndUnloadAsync();
      console.log("Successfully stopped recording");
      
      // Get URI and proceed with processing
      const uri = currentRecording.getURI();
      console.log("Successfully got URI" + uri);
      if (uri) {
        setRecordingUri(uri);
        console.log("Getting recording duration..." + recordingDuration);
        // Process the recording if it meets minimum length
        if (recordingDuration >= 30) {
          processRecording(uri);
          console.log("Processing recording completed.");
        } else {
          Alert.alert('Recording Too Short', 'Recording should be at least 30 seconds long. Please try again.');
        }
      }
    } catch (stopError) {
      console.warn('Could not stop recording properly:', stopError);
      
      // Always try to get the URI anyway, even if stopping fails
      try {
        const uri = currentRecording.getURI();
        console.log("Attempting to get URI despite stop error" + uri);
        if (uri && recordingDuration >= 30) {
          console.log("Successfully got URI despite stop error");
          setRecordingUri(uri);
          processRecording(uri);
          return; // We recovered successfully
        }
      } catch (uriError) {
        console.warn("Could not get URI after failed stop:", uriError);
      }
      
      // If we reach here, we couldn't recover
      Alert.alert('Recording Error', 'There was a problem with the recording. Please try again.');
    }
  };

    // Modify processRecording to save the recording
    const processRecording = async (uri: string): Promise<void> => {
      setIsLoading(true);
      
      try {
        const transcription = await transcribeAudio(uri);
        setTranscriptionText(transcription);
        
        const analysis = await analyzeTranscript(transcription);
        setAnalysisResult(analysis);
  
        // Save the recording
        const newRecording: RecordingHistory = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          duration: recordingDuration,
          uri,
          transcription,
          analysis,
        };
  
        await saveRecording(newRecording);
      } catch (error) {
        console.error('Error processing recording:', error);
        Alert.alert(
          'Processing Error', 
          'Failed to process your recording. Please try again.'
        );
      } finally {
        setIsLoading(false);
      }
    };
  // Process the recorded audio


  // Placeholder for OpenAI Whisper transcription
  // In a real app, you would send the audio to OpenAI's API
  const transcribeAudio = async (audioUri: string): Promise<string> => {
    // Simulating API call latency
    await new Promise(resolve => setTimeout(resolve, 2000));

    //make a call to OpenAI Whisper API
    // This is a placeholder for the actual API call
    // You would need to set up your API key and endpoint
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error("OpenAI API key not set");
    } 

    // First, verify the file exists
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (!fileInfo.exists) {
      throw new Error('Audio file does not exist');
    }

    // Create the form data
    const formData = new FormData();
    
    // Prepare file path
    const fileUri = Platform.OS === 'android' ? audioUri : audioUri.replace('file://', '');

    // Add file to form data
    formData.append('file', {
      uri: fileUri,
      type: 'audio/m4a',
      name: 'recording.m4a'
    } as any);

    formData.append('model', 'whisper-1');

    // Make the API call using fetch instead
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ` + OPENAI_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.text;


    // PLACEHOLDER: This is where you would integrate with OpenAI Whisper API
    // Example implementation would be:
    /*
    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'speech.m4a',
    });
    formData.append('model', 'whisper-1');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    return data.text;
    */
    
    // For this example, return sample text
    // return "This is a simulated transcription of what would be your recorded speech. In a real implementation, this text would come from OpenAI's Whisper speech-to-text service after processing your audio recording.";
  };

  // Placeholder for transcript analysis
  // In a real app, this would use a mobile-optimized language model
  const analyzeTranscript = async (text: string): Promise<AnalysisResult> => {
    // Simulating processing time
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // PLACEHOLDER: This is where you would integrate with a mobileBERT or similar model
    // The real implementation would depend on how you deploy your model
    // (TensorFlow.js, TensorFlow Lite, etc.)
    
    // For this example, we'll do a very simple analysis
    const wordCount = text.split(/\s+/).length;
    const sentenceCount = text.split(/[.!?]+/).filter(Boolean).length;
    const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;
    
    // Simple scoring algorithm (for demonstration)
    let score = 7; // Base score
    
    // Adjust based on "complexity" (very simplistic)
    if (avgWordsPerSentence < 5) score -= 1;
    if (avgWordsPerSentence > 15) score -= 1;
    if (wordCount < 30) score -= 1;
    
    // Make sure score is within bounds
    score = Math.max(0, Math.min(10, score));
    
    // Generate feedback based on our simple metrics
    let feedback = "";
    
    if (wordCount < 30) {
      feedback += "Your response was quite brief. Try to elaborate more on your thoughts. ";
    } else if (wordCount > 100) {
      feedback += "You provided a detailed response with good elaboration. ";
    }
    
    if (avgWordsPerSentence < 5) {
      feedback += "Your sentences were very short. Consider combining related ideas. ";
    } else if (avgWordsPerSentence > 15) {
      feedback += "Your sentences were quite long. Consider breaking complex ideas into shorter sentences for clarity. ";
    } else {
      feedback += "You had a good balance of sentence lengths. ";
    }
    
    feedback += `Overall, your response had ${wordCount} words across approximately ${sentenceCount} sentences.`;
    
    return {
      score: score.toFixed(1),
      feedback,
      metrics: {
        wordCount,
        sentenceCount,
        avgWordsPerSentence: avgWordsPerSentence.toFixed(1),
      }
    };
  };

    // Navigation handlers
    const handleNewRecording = () => {
      resetRecordingState();
      setShowRecording(true);
      setSelectedRecording(null);
    };
  
    const handleViewRecording = (recording: RecordingHistory) => {
      setSelectedRecording(recording);
      setShowRecording(true);
    };
  
    const handleBack = () => {
      setShowRecording(false);
      setSelectedRecording(null);
    };
    const handleDeleteRecording = async (id: string) => {
      const updatedRecordings = recordings.filter(item => item.id !== id);
      await AsyncStorage.setItem('recordings', JSON.stringify(updatedRecordings));
      setRecordings(updatedRecordings);
      setSelectedRecording(null);
    };


  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Speak Well</Text>
      </View>
      
      {showRecording ? (
        <>
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={handleBack}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>
              {selectedRecording ? 'View Recording' : 'New Recording'}
            </Text>
          </View>

          {selectedRecording ? (
            // View recording details
            <ScrollView style={styles.content}>
              <View style={styles.recordingDetails}>
                <Text style={styles.dateText}>
                  {new Date(selectedRecording.date).toLocaleString('en-US', {
                    month: 'long',
                    day: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Transcription</Text>
                  <View style={styles.transcriptionBox}>
                    <Text style={styles.transcriptionText}>{selectedRecording.transcription}</Text>
                  </View>
                </View>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Analysis Results</Text>
                  <View style={styles.scoreContainer}>
                    <Text style={styles.scoreLabel}>Score</Text>
                    <View style={styles.scoreCircle}>
                      <Text style={styles.scoreValue}>{selectedRecording.analysis.score}</Text>
                      <Text style={styles.scoreMax}>/10</Text>
                    </View>
                  </View>
                  <View style={styles.feedbackContainer}>
                    <Text style={styles.feedbackTitle}>Feedback</Text>
                    <Text style={styles.feedbackText}>{selectedRecording.analysis.feedback}</Text>
                  </View>
                </View>
                {/* Display transcription and analysis */}
                {/* ... existing analysis display code ... */}
              </View>
            </ScrollView>
          ): (
      
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* Recording Section */}
          <View style={styles.recordingSection}>
            <Text style={styles.sectionTitle}>
              {isRecording ? 'Recording in Progress' : 'Record Your English Language'}
            </Text>
            
            <View style={styles.timerContainer}>
              <Text style={styles.timer}>
                {formatTime(recordingDuration)}
              </Text>
              {isRecording && recordingDuration < 30 && (
                <Text style={styles.timerHint}>
                  (Minimum 30 seconds required)
                </Text>
              )}
            </View>
            
            <TouchableOpacity
              style={[
                styles.recordButton,
                isRecording ? styles.recordingActive : {}
              ]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <Text style={styles.recordButtonText}>
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Processing Indicator */}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6200ee" />
              <Text style={styles.loadingText}>Processing your recording...</Text>
            </View>
          )}
          
          {/* Transcription Section */}
          {transcriptionText && !isLoading && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Transcription</Text>
              <View style={styles.transcriptionBox}>
                <Text style={styles.transcriptionText}>{transcriptionText}</Text>
              </View>
            </View>
          )}
          
          {/* Analysis Results Section */}
          {analysisResult && !isLoading && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Analysis Results</Text>
              
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreLabel}>Score</Text>
                <View style={styles.scoreCircle}>
                  <Text style={styles.scoreValue}>{analysisResult.score}</Text>
                  <Text style={styles.scoreMax}>/10</Text>
                </View>
              </View>
              
              <View style={styles.feedbackContainer}>
                <Text style={styles.feedbackTitle}>Feedback</Text>
                <Text style={styles.feedbackText}>{analysisResult.feedback}</Text>
              </View>
              
              <View style={styles.metricsContainer}>
                <Text style={styles.metricsTitle}>Detailed Metrics</Text>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Word Count:</Text>
                  <Text style={styles.metricValue}>{analysisResult.metrics.wordCount}</Text>
                </View>
                
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Sentence Count:</Text>
                  <Text style={styles.metricValue}>{analysisResult.metrics.sentenceCount}</Text>
                </View>
                
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Avg. Words per Sentence:</Text>
                  <Text style={styles.metricValue}>{analysisResult.metrics.avgWordsPerSentence}</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
          )}
        </>
      ) : (
        <Dashboard 
          recordings={recordings} 
          onNewRecording={handleNewRecording} 
          onViewRecording={handleViewRecording} 
        />
      )}
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#6200ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  recordingSection: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  timer: {
    fontSize: 48,
    fontWeight: '300',
    color: '#333',
  },
  timerHint: {
    color: '#666',
    marginTop: 5,
    fontSize: 14,
  },
  recordButton: {
    backgroundColor: '#6200ee',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  recordingActive: {
    backgroundColor: '#ff5252',
  },
  recordButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  transcriptionBox: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  scoreLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#6200ee',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  scoreValue: {
    fontSize: 30,
    fontWeight: 'bold',
    color: 'white',
  },
  scoreMax: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    alignSelf: 'flex-end',
    marginBottom: 6,
  },
  feedbackContainer: {
    marginBottom: 20,
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  feedbackText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#444',
  },
  metricsContainer: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
  },
  metricsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  metricLabel: {
    fontSize: 15,
    color: '#666',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
  },
  dateText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  recordingDetails: {
    padding: 16,
  },
});