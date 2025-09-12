import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { Doc, Id } from './_generated/dataModel';
// import { AssessmentType } from '@/types/assessments';

// Define assessment types directly to avoid import issues
const AssessmentType = {
  OSWESTRY: 'oswestry' as const,
  DASH: 'dash' as const,
  ROLAND_MORRIS: 'roland_morris' as const,
  NECK_DISABILITY: 'neck_disability' as const,
  KNEE_INJURY: 'knee_injury' as const
};

// Schema definitions
export const assessmentSchemas = {
  oswestry: v.object({
    painIntensity: v.number(),
    personalCare: v.number(),
    lifting: v.number(),
    walking: v.number(),
    sitting: v.number(),
    standing: v.number(),
    sleeping: v.number(),
    sexLife: v.number(),
    socialLife: v.number(),
    traveling: v.number(),
  }),
  
  dash: v.object({
    openingTightJar: v.number(),
    householdChores: v.number(),
    carryingHeavyObjects: v.number(),
    changingOverheadLight: v.number(),
    washingBack: v.number(),
    recreationalActivities: v.number(),
  }),
  
  dashWorkModule: v.optional(v.object({
    difficultyWork: v.number(),
    interfereWork: v.number(),
  })),
  
  dashSportsModule: v.optional(v.object({
    difficultySports: v.number(),
    interfereSports: v.number(),
  })),
};

// Create Oswestry Assessment
export const createOswestryAssessment = mutation({
  args: {
    patientId: v.id('users'),
    responses: assessmentSchemas.oswestry,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new Error('Not authenticated');
    
    const totalScore = Object.values(args.responses).reduce((sum, val) => sum + val, 0);
    const percentage = (totalScore / 50) * 100;
    
    let interpretation = '';
    if (percentage <= 20) interpretation = 'Minimal disability';
    else if (percentage <= 40) interpretation = 'Moderate disability';
    else if (percentage <= 60) interpretation = 'Severe disability';
    else if (percentage <= 80) interpretation = 'Crippled';
    else interpretation = 'Bed-bound or exaggerating';
    
    return await ctx.db.insert('assessments', {
      patientId: args.patientId,
      physiotherapistId: user.subject as Id<'users'>,
      clinicId: undefined,
      assessmentType: 'oswestry',
      title: 'Oswestry Disability Index',
      responses: Object.entries(args.responses).map(([questionId, answer]) => ({
        questionId,
        question: questionId,
        answer,
        score: answer as number
      })),
      totalScore,
      maxScore: 50,
      percentageScore: percentage,
      interpretation,
      notes: args.notes,
      completedAt: Date.now(),
      createdAt: Date.now(),
    });
  },
});

// Create DASH Assessment
export const createDashAssessment = mutation({
  args: {
    patientId: v.id('users'),
    responses: assessmentSchemas.dash,
    workModule: assessmentSchemas.dashWorkModule,
    sportsModule: assessmentSchemas.dashSportsModule,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new Error('Not authenticated');
    
    const totalScore = Object.values(args.responses).reduce((sum, val) => sum + val, 0);
    const dashScore = ((totalScore / 30) - 1) * 25;
    
    let interpretation = '';
    if (dashScore <= 25) interpretation = 'No disability';
    else if (dashScore <= 50) interpretation = 'Mild disability';
    else if (dashScore <= 75) interpretation = 'Moderate disability';
    else interpretation = 'Severe disability';
    
    return await ctx.db.insert('assessments', {
      patientId: args.patientId,
      physiotherapistId: user.subject as Id<'users'>,
      clinicId: undefined,
      assessmentType: 'custom' as const,
      title: 'DASH Assessment',
      responses: Object.entries(args.responses).map(([questionId, answer]) => ({
        questionId,
        question: questionId,
        answer,
        score: answer as number
      })),
      totalScore: dashScore,
      maxScore: 100,
      percentageScore: dashScore,
      interpretation,
      notes: args.notes,
      completedAt: Date.now(),
      createdAt: Date.now(),
    });
  },
});

// Get patient assessments
export const getPatientAssessments = query({
  args: { patientId: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('assessments')
      .withIndex('by_patient', (q) => q.eq('patientId', args.patientId))
      .order('desc')
      .collect();
  },
});

// Get specific assessment
export const getAssessment = query({
  args: { assessmentId: v.id('assessments') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.assessmentId);
  },
});

// Get assessment history with trends
export const getAssessmentHistory = query({
  args: { 
    patientId: v.id('users'),
    assessmentType: v.string(),
  },
  handler: async (ctx, args) => {
    const assessments = await ctx.db
      .query('assessments')
      .filter((q) => 
        q.and(
          q.eq(q.field('patientId'), args.patientId),
          q.eq(q.field('assessmentType'), args.assessmentType)
        )
      )
      .order('desc')
      .collect();
    return assessments;
  },
});
