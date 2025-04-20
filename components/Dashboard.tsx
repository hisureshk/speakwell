// components/Dashboard.tsx
import React from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet 
} from 'react-native';
import { format } from 'date-fns';
import { RecordingHistory } from '../types';

interface DashboardProps {
  recordings: RecordingHistory[];
  onNewRecording: () => void;
  onViewRecording: (recording: RecordingHistory) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  recordings, 
  onNewRecording, 
  onViewRecording 
}) => {
  const renderRecordingItem = ({ item }: { item: RecordingHistory }) => (
    <TouchableOpacity 
      style={styles.recordingItem} 
      onPress={() => onViewRecording(item)}
    >
      <View style={styles.recordingHeader}>
        <Text style={styles.dateText}>
          {format(new Date(item.date), 'MMM dd, yyyy HH:mm')}
        </Text>
        <Text style={styles.scoreText}>Score: {item.analysis.score}/10</Text>
      </View>
      
      <View style={styles.recordingDetails}>
        <Text style={styles.durationText}>
          Duration: {Math.floor(item.duration / 60)}:{(item.duration % 60)
            .toString()
            .padStart(2, '0')}
        </Text>
        <Text style={styles.wordCountText}>
          Words: {item.analysis.metrics.wordCount}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recording History</Text>
        <TouchableOpacity 
          style={styles.newRecordingButton}
          onPress={onNewRecording}
        >
          <Text style={styles.newRecordingButtonText}>New Recording</Text>
        </TouchableOpacity>
      </View>

      {recordings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No recordings yet. Tap "New Recording" to get started!
          </Text>
        </View>
      ) : (
        <FlatList
          data={recordings}
          renderItem={renderRecordingItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  newRecordingButton: {
    backgroundColor: '#6200ee',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newRecordingButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  recordingItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  recordingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6200ee',
  },
  recordingDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  durationText: {
    color: '#666',
  },
  wordCountText: {
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
