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
  KNEE_INJURY: 'knee_injury' as const,
  PSFS: 'psfs' as const,
  NPRS: 'nprs' as const,
  NPS: 'nps' as const
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

  psfs: v.object({
    activity1: v.object({ name: v.string(), score: v.number() }),
    activity2: v.optional(v.object({ name: v.string(), score: v.number() })),
    activity3: v.optional(v.object({ name: v.string(), score: v.number() })),
  }),

  nprs: v.object({
    currentPain: v.number(),
    bestPain: v.number(),
    worstPain: v.number(),
  }),

  nps: v.object({
    rating: v.number(),
    feedback: v.optional(v.string()),
  }),
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

// Create PSFS Assessment
export const createPSFSAssessment = mutation({
  args: {
    patientId: v.id('users'),
    responses: assessmentSchemas.psfs,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new Error('Not authenticated');
    
    let totalScore = args.responses.activity1.score;
    let count = 1;
    
    const responsesList = [
      {
        questionId: "activity1",
        question: args.responses.activity1.name,
        answer: args.responses.activity1.score,
        score: args.responses.activity1.score
      }
    ];

    if (args.responses.activity2) {
      totalScore += args.responses.activity2.score;
      count++;
      responsesList.push({
        questionId: "activity2",
        question: args.responses.activity2.name,
        answer: args.responses.activity2.score,
        score: args.responses.activity2.score
      });
    }
    
    if (args.responses.activity3) {
      totalScore += args.responses.activity3.score;
      count++;
      responsesList.push({
        questionId: "activity3",
        question: args.responses.activity3.name,
        answer: args.responses.activity3.score,
        score: args.responses.activity3.score
      });
    }

    const averageScore = Number((totalScore / count).toFixed(1));
    const percentage = (averageScore / 10) * 100;

    return await ctx.db.insert('assessments', {
      patientId: args.patientId,
      physiotherapistId: user.subject as Id<'users'>,
      clinicId: undefined,
      assessmentType: 'psfs',
      title: 'Patient-Specific Functional Scale',
      responses: responsesList,
      totalScore: averageScore,
      maxScore: 10,
      percentageScore: percentage,
      interpretation: `${averageScore}/10 functional capability`,
      notes: args.notes,
      completedAt: Date.now(),
      createdAt: Date.now(),
    });
  },
});

// Create NPRS Assessment
export const createNPRSAssessment = mutation({
  args: {
    patientId: v.id('users'),
    responses: assessmentSchemas.nprs,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new Error('Not authenticated');
    
    const totalScore = args.responses.currentPain;
    const percentage = (totalScore / 10) * 100;
    
    let interpretation = '';
    if (totalScore === 0) interpretation = 'No pain';
    else if (totalScore <= 3) interpretation = 'Mild pain';
    else if (totalScore <= 6) interpretation = 'Moderate pain';
    else interpretation = 'Severe pain';
    
    return await ctx.db.insert('assessments', {
      patientId: args.patientId,
      physiotherapistId: user.subject as Id<'users'>,
      clinicId: undefined,
      assessmentType: 'nprs',
      title: 'Numeric Pain Rating Scale',
      responses: Object.entries(args.responses).map(([questionId, answer]) => ({
        questionId,
        question: questionId === 'currentPain' ? 'Current Pain' : questionId === 'bestPain' ? 'Best Pain (last 24h)' : 'Worst Pain (last 24h)',
        answer,
        score: answer as number
      })),
      totalScore,
      maxScore: 10,
      percentageScore: percentage,
      interpretation,
      notes: args.notes,
      completedAt: Date.now(),
      createdAt: Date.now(),
    });
  },
});

// Create NPS Assessment
export const createNPSAssessment = mutation({
  args: {
    patientId: v.id('users'),
    responses: assessmentSchemas.nps,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new Error('Not authenticated');
    
    const score = args.responses.rating;
    
    let interpretation = '';
    if (score >= 9) interpretation = 'Promoter';
    else if (score >= 7) interpretation = 'Passive';
    else interpretation = 'Detractor';
    
    return await ctx.db.insert('assessments', {
      patientId: args.patientId,
      physiotherapistId: user.subject as Id<'users'>,
      clinicId: undefined,
      assessmentType: 'nps',
      title: 'Net Promoter Score',
      responses: [
        {
          questionId: "rating",
          question: "How likely are you to recommend us?",
          answer: score,
          score: score
        },
        ...(args.responses.feedback ? [{
          questionId: "feedback",
          question: "Feedback",
          answer: args.responses.feedback,
          score: 0
        }] : [])
      ],
      totalScore: score,
      maxScore: 10,
      percentageScore: (score / 10) * 100,
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
