export interface DailyRoomConfig {
  name?: string;
  privacy?: 'public' | 'private';
  properties?: {
    max_participants?: number;
    enable_chat?: boolean;
    enable_screenshare?: boolean;
    enable_recording?: boolean;
    enable_knocking?: boolean;
    enable_prejoin_ui?: boolean;
    exp?: number; // Expiration time in seconds since epoch
    eject_at_room_exp?: boolean;
    eject_after_elapsed?: number; // Auto-eject after X seconds
    lang?: string;
    geo?: 'us-west' | 'us-east' | 'eu-west' | 'ap-southeast' | 'ap-south';
  };
}

export interface DailyRoom {
  id: string;
  name: string;
  api_created: boolean;
  privacy: 'public' | 'private';
  url: string;
  created_at: string;
  config: {
    max_participants: number;
    enable_chat: boolean;
    enable_screenshare: boolean;
    enable_recording: boolean;
    enable_knocking: boolean;
    enable_prejoin_ui: boolean;
    exp?: number;
    eject_at_room_exp?: boolean;
    eject_after_elapsed?: number;
    lang?: string;
    geo?: string;
  };
}

export class DailyService {
  private apiKey: string;
  private domain: string;
  private baseUrl: string;

  constructor(apiKey?: string, domain?: string) {
    this.apiKey = apiKey || process.env.DAILY_API_KEY || '';
    this.domain = domain || process.env.NEXT_PUBLIC_DAILY_DOMAIN || '';
    this.baseUrl = 'https://api.daily.co/v1';
    
    if (!this.apiKey) {
      console.warn('Daily.co API key not provided. Room creation will not work.');
    }
    
    if (!this.domain) {
      console.warn('Daily.co domain not provided. Using default domain.');
    }
  }

  /**
   * Create a new Daily.co room
   */
  async createRoom(config: DailyRoomConfig = {}): Promise<DailyRoom> {
    if (!this.apiKey) {
      throw new Error('Daily.co API key is required to create rooms');
    }

    const roomConfig = {
      name: config.name,
      privacy: config.privacy || 'private',
      properties: {
        max_participants: config.properties?.max_participants || 10,
        enable_chat: config.properties?.enable_chat ?? true,
        enable_screenshare: config.properties?.enable_screenshare ?? true,
        enable_recording: config.properties?.enable_recording ?? false,
        enable_knocking: config.properties?.enable_knocking ?? true,
        enable_prejoin_ui: config.properties?.enable_prejoin_ui ?? true,
        exp: config.properties?.exp,
        eject_at_room_exp: config.properties?.eject_at_room_exp ?? true,
        eject_after_elapsed: config.properties?.eject_after_elapsed,
        lang: config.properties?.lang || 'en',
        geo: config.properties?.geo || 'us-west',
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(roomConfig),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create Daily.co room: ${errorData.error || response.statusText}`);
      }

      const room = await response.json();
      return room;
    } catch (error) {
      console.error('Error creating Daily.co room:', error);
      throw error;
    }
  }

  /**
   * Get room information
   */
  async getRoom(roomName: string): Promise<DailyRoom> {
    if (!this.apiKey) {
      throw new Error('Daily.co API key is required to get room information');
    }

    try {
      const response = await fetch(`${this.baseUrl}/rooms/${roomName}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to get Daily.co room: ${errorData.error || response.statusText}`);
      }

      const room = await response.json();
      return room;
    } catch (error) {
      console.error('Error getting Daily.co room:', error);
      throw error;
    }
  }

  /**
   * Delete a room
   */
  async deleteRoom(roomName: string): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Daily.co API key is required to delete rooms');
    }

    try {
      const response = await fetch(`${this.baseUrl}/rooms/${roomName}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to delete Daily.co room: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting Daily.co room:', error);
      throw error;
    }
  }

  /**
   * Generate a room URL for joining
   */
  getRoomUrl(roomName: string): string {
    if (this.domain) {
      return `https://${this.domain}/${roomName}`;
    }
    return `https://${roomName}.daily.co`;
  }

  /**
   * Create a meeting token for enhanced security and custom user properties
   */
  async createMeetingToken(roomName: string, properties: {
    user_name?: string;
    user_id?: string;
    is_owner?: boolean;
    exp?: number;
    enable_screenshare?: boolean;
    enable_recording?: boolean;
    start_video_off?: boolean;
    start_audio_off?: boolean;
  } = {}): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Daily.co API key is required to create meeting tokens');
    }

    const tokenPayload = {
      room_name: roomName,
      properties: {
        user_name: properties.user_name,
        user_id: properties.user_id,
        is_owner: properties.is_owner ?? false,
        exp: properties.exp || Math.floor(Date.now() / 1000) + (4 * 60 * 60), // 4 hours default
        enable_screenshare: properties.enable_screenshare ?? true,
        enable_recording: properties.enable_recording ?? false,
        start_video_off: properties.start_video_off ?? false,
        start_audio_off: properties.start_audio_off ?? false,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/meeting-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(tokenPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create meeting token: ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('Error creating meeting token:', error);
      throw error;
    }
  }

  /**
   * Get analytics for a room
   */
  async getRoomAnalytics(roomName: string): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error('Daily.co API key is required to get room analytics');
    }

    try {
      const response = await fetch(`${this.baseUrl}/rooms/${roomName}/analytics`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to get room analytics: ${errorData.error || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting room analytics:', error);
      throw error;
    }
  }
}

// Create a singleton instance
export const dailyService = new DailyService();

// Helper function to create a room with sensible defaults for healthcare
export async function createHealthcareRoom(config: {
  name?: string;
  maxParticipants?: number;
  durationMinutes?: number;
  enableRecording?: boolean;
  enableWaitingRoom?: boolean;
} = {}): Promise<DailyRoom> {
  const expTime = config.durationMinutes 
    ? Math.floor(Date.now() / 1000) + (config.durationMinutes * 60)
    : Math.floor(Date.now() / 1000) + (2 * 60 * 60); // 2 hours default

  return dailyService.createRoom({
    name: config.name,
    privacy: 'private',
    properties: {
      max_participants: config.maxParticipants || 10,
      enable_chat: true,
      enable_screenshare: true,
      enable_recording: config.enableRecording || false,
      enable_knocking: config.enableWaitingRoom || true,
      enable_prejoin_ui: true,
      exp: expTime,
      eject_at_room_exp: true,
      lang: 'en',
      geo: 'us-west',
    },
  });
}

// Helper function to create a meeting token with healthcare-specific defaults
export async function createHealthcareMeetingToken(
  roomName: string,
  user: {
    name: string;
    id: string;
    isHost?: boolean;
  },
  options: {
    durationMinutes?: number;
    enableRecording?: boolean;
    startWithVideoOff?: boolean;
    startWithAudioOff?: boolean;
  } = {}
): Promise<string> {
  const expTime = options.durationMinutes 
    ? Math.floor(Date.now() / 1000) + (options.durationMinutes * 60)
    : Math.floor(Date.now() / 1000) + (2 * 60 * 60); // 2 hours default

  return dailyService.createMeetingToken(roomName, {
    user_name: user.name,
    user_id: user.id,
    is_owner: user.isHost || false,
    exp: expTime,
    enable_recording: options.enableRecording || false,
    start_video_off: options.startWithVideoOff || false,
    start_audio_off: options.startWithAudioOff || false,
  });
} 