/**
 * ExerciseDB API Service
 * Integrates with ExerciseDB for exercise data and videos
 */

const EXERCISEDB_BASE_URL = 'https://v2.exercisedb.dev';
const EXERCISEDB_API_KEY = process.env.NEXT_PUBLIC_EXERCISEDB_API_KEY || '';

export interface Exercise {
  id: string;
  name: string;
  bodyParts: string[];
  equipments: string[];
  imageUrl: string;
  videoUrl: string;
  targetMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  exerciseType: string;
  overview: string;
}

// ExerciseDB API response interface
interface ExerciseDBApiResponse {
  exerciseId?: string;
  id?: string;
  name: string;
  bodyParts?: string[];
  equipments?: string[];
  imageUrl?: string;
  videoUrl?: string;
  targetMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  exerciseType?: string;
  overview?: string;
}


export interface ExerciseSearchParams {
  name?: string;
  keywords?: string;
  targetMuscles?: string;
  secondaryMuscles?: string;
  exerciseType?: string;
  bodyParts?: string;
  equipments?: string;
  limit?: number;
  after?: string;
  before?: string;
}

class ExerciseService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = EXERCISEDB_API_KEY;
    this.baseUrl = EXERCISEDB_BASE_URL;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async makeRequest(endpoint: string): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // If an API key is provided, include it in the request headers
    // Guard against common misconfiguration where a URL is placed in the API key env var
    const looksLikeUrl = /^https?:\/\//i.test(this.apiKey || '');
    if (this.apiKey && !looksLikeUrl) {
      headers['x-api-key'] = this.apiKey;
    } else if (this.apiKey && looksLikeUrl) {
      // eslint-disable-next-line no-console
      console.warn('[ExerciseDB] NEXT_PUBLIC_EXERCISEDB_API_KEY appears to be a URL. Expected an API key/token. Ignoring header.');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const maxAttempts = 2; // 1 retry for transient failures
    const timeoutMs = 10000; // 10s timeout

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          // Retry on 5xx once
          if (response.status >= 500 && attempt < maxAttempts) {
            continue;
          }
          throw new Error(`ExerciseDB API error: ${response.status}`);
        }

        return await response.json();
      } catch (err) {
        lastError = err;
        // Retry once for network/abort errors
        if (attempt < maxAttempts) {
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('ExerciseDB request failed');
  }

  /**
   * Get all exercises with optional filtering
   */
  async getExercises(params: ExerciseSearchParams = {}): Promise<Exercise[]> {
    const { limit = 10 } = params;
    
    try {
      const queryParams = new URLSearchParams();
      
      if (params.name) queryParams.append('name', params.name);
      if (params.keywords) queryParams.append('keywords', params.keywords);
      if (params.targetMuscles) queryParams.append('targetMuscles', params.targetMuscles);
      if (params.secondaryMuscles) queryParams.append('secondaryMuscles', params.secondaryMuscles);
      if (params.exerciseType) queryParams.append('exerciseType', params.exerciseType);
      if (params.bodyParts) queryParams.append('bodyParts', params.bodyParts);
      if (params.equipments) queryParams.append('equipments', params.equipments);
      if (params.after) queryParams.append('after', params.after);
      if (params.before) queryParams.append('before', params.before);
      
      queryParams.append('limit', limit.toString());
      
      const endpoint = `/api/v1/exercises?${queryParams.toString()}`;
      const response = await this.makeRequest(endpoint);
      
      if (response.success && response.data && Array.isArray(response.data)) {
        return response.data.map((item: ExerciseDBApiResponse) => this.transformExercise(item));
      }
      
      return this.getFallbackExercises();
    } catch (error) {
      console.error('Error fetching exercises:', error);
      return this.getFallbackExercises();
    }
  }

  /**
   * Get exercise by ID
   */
  async getExerciseById(id: string): Promise<Exercise | null> {
    try {
      const response = await this.makeRequest(`/api/v1/exercises/${id}`);
      if (response.success && response.data && Array.isArray(response.data) && response.data.length > 0) {
        return this.transformExercise(response.data[0] as ExerciseDBApiResponse);
      }
      return null;
    } catch (error) {
      console.error('Error fetching exercise by ID:', error);
      return null;
    }
  }

  /**
   * Search exercises by name
   */
  async searchExercises(query: string): Promise<Exercise[]> {
    try {
      const response = await this.makeRequest(`/api/v1/exercises/search?search=${encodeURIComponent(query)}`);
      if (response.success && response.data && Array.isArray(response.data)) {
        return response.data.map((item: ExerciseDBApiResponse) => this.transformExercise(item));
      }
      return [];
    } catch (error) {
      console.error('Error searching exercises:', error);
      return [];
    }
  }

  /**
   * Get available body parts
   */
  async getBodyParts(): Promise<string[]> {
    try {
      const response = await this.makeRequest('/api/v1/bodyparts');
      if (response.success && response.data && Array.isArray(response.data)) {
        return response.data as string[];
      }
      return ['back', 'cardio', 'chest', 'lower arms', 'lower legs', 'neck', 'shoulders', 'upper arms', 'upper legs', 'waist'];
    } catch (error) {
      console.error('Error fetching body parts:', error);
      return ['back', 'cardio', 'chest', 'lower arms', 'lower legs', 'neck', 'shoulders', 'upper arms', 'upper legs', 'waist'];
    }
  }

  /**
   * Get available equipment
   */
  async getEquipment(): Promise<string[]> {
    try {
      const response = await this.makeRequest('/api/v1/equipments');
      if (response.success && response.data && Array.isArray(response.data)) {
        return response.data as string[];
      }
      return ['body weight', 'dumbbell', 'barbell', 'kettlebell', 'cable', 'machine', 'resistance band'];
    } catch (error) {
      console.error('Error fetching equipment:', error);
      return ['body weight', 'dumbbell', 'barbell', 'kettlebell', 'cable', 'machine', 'resistance band'];
    }
  }

  /**
   * Get available target muscles
   */
  async getTargetMuscles(): Promise<string[]> {
    try {
      const response = await this.makeRequest('/api/v1/muscles');
      if (response.success && response.data && Array.isArray(response.data)) {
        return response.data as string[];
      }
      return ['abs', 'biceps', 'calves', 'cardiovascular system', 'delts', 'forearms', 'glutes', 'hamstrings', 'lats', 'pectorals', 'quads', 'traps', 'triceps'];
    } catch (error) {
      console.error('Error fetching target muscles:', error);
      return ['abs', 'biceps', 'calves', 'cardiovascular system', 'delts', 'forearms', 'glutes', 'hamstrings', 'lats', 'pectorals', 'quads', 'traps', 'triceps'];
    }
  }

  /**
   * Transform API response to our Exercise interface
   */
  private transformExercise(apiExercise: ExerciseDBApiResponse): Exercise {
    return {
      id: apiExercise.exerciseId || apiExercise.id || 'unknown',
      name: apiExercise.name,
      bodyParts: apiExercise.bodyParts || [],
      equipments: apiExercise.equipments || [],
      imageUrl: apiExercise.imageUrl || '',
      videoUrl: apiExercise.videoUrl || '',
      targetMuscles: apiExercise.targetMuscles || [],
      secondaryMuscles: apiExercise.secondaryMuscles || [],
      instructions: apiExercise.instructions || [],
      exerciseType: apiExercise.exerciseType || 'strength',
      overview: apiExercise.overview || '',
    };
  }

  /**
   * Fallback exercises when API is unavailable
   */
  private getFallbackExercises(): Exercise[] {
    return [
      {
        id: 'fallback_001',
        name: 'Bird Dog',
        bodyParts: ['back'],
        equipments: ['body weight'],
        imageUrl: '',
        videoUrl: '',
        targetMuscles: ['spine'],
        secondaryMuscles: ['abs', 'glutes'],
        instructions: [
          'Start on your hands and knees in a tabletop position',
          'Extend your right arm forward and left leg back simultaneously',
          'Hold for 5 seconds while maintaining balance',
          'Return to starting position and repeat with opposite arm and leg'
        ],
        exerciseType: 'strength',
        overview: 'Core stability exercise for lower back pain'
      },
      {
        id: 'fallback_002',
        name: 'Cat-Camel Stretch',
        bodyParts: ['back'],
        equipments: ['body weight'],
        imageUrl: '',
        videoUrl: '',
        targetMuscles: ['spine'],
        secondaryMuscles: ['abs'],
        instructions: [
          'Start on your hands and knees',
          'Arch your back up like a cat (flexion)',
          'Lower your belly and lift your chest (extension)',
          'Move slowly between these two positions'
        ],
        exerciseType: 'flexibility',
        overview: 'Spinal mobility exercise'
      },
      {
        id: 'fallback_003',
        name: 'Plank',
        bodyParts: ['waist'],
        equipments: ['body weight'],
        imageUrl: '',
        videoUrl: '',
        targetMuscles: ['abs'],
        secondaryMuscles: ['shoulders', 'back'],
        instructions: [
          'Start in a push-up position',
          'Lower to your forearms',
          'Keep your body in a straight line',
          'Hold the position while breathing normally'
        ],
        exerciseType: 'strength',
        overview: 'Core strengthening exercise'
      }
    ];
  }
}

export const exerciseService = new ExerciseService();
