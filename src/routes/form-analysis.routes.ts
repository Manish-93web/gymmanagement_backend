import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ─── EXERCISE STANDARDS ───────────────────────────────────────────────────────
const EXERCISE_STANDARDS: Record<string, {
  name: string;
  joints: string[];
  phases: Array<{
    name: string;
    angles: Record<string, { min: number; max: number; optimal: number }>;
    cues: string[];
  }>;
  repDetection: { joint: string; axis: 'angle'; bottomThreshold: number; topThreshold: number };
  commonErrors: Array<{ id: string; description: string; correction: string; affectedJoints: string[] }>;
}> = {
  squat: {
    name: 'Squat',
    joints: ['leftKnee', 'rightKnee', 'leftHip', 'rightHip', 'leftAnkle', 'rightAnkle'],
    phases: [
      {
        name: 'bottom',
        angles: {
          knee: { min: 70, max: 110, optimal: 90 },
          hip: { min: 60, max: 100, optimal: 80 },
          trunk: { min: 0, max: 45, optimal: 20 },
        },
        cues: ['Chest up', 'Knees over toes', 'Weight in heels'],
      },
      {
        name: 'top',
        angles: {
          knee: { min: 165, max: 180, optimal: 175 },
          hip: { min: 165, max: 180, optimal: 175 },
        },
        cues: ['Stand tall', 'Squeeze glutes'],
      },
    ],
    repDetection: { joint: 'knee', axis: 'angle', bottomThreshold: 110, topThreshold: 155 },
    commonErrors: [
      { id: 'knee_cave', description: 'Knees caving inward (valgus collapse)', correction: 'Push knees out in line with toes', affectedJoints: ['leftKnee', 'rightKnee'] },
      { id: 'forward_lean', description: 'Excessive forward lean', correction: 'Keep chest up and core braced', affectedJoints: ['leftHip', 'rightHip'] },
      { id: 'heel_rise', description: 'Heels coming off ground', correction: 'Work on ankle mobility, push through heels', affectedJoints: ['leftAnkle', 'rightAnkle'] },
      { id: 'shallow_depth', description: 'Not reaching parallel depth', correction: 'Squat until thighs are at least parallel to floor', affectedJoints: ['leftHip', 'rightHip'] },
    ],
  },
  deadlift: {
    name: 'Deadlift',
    joints: ['leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftShoulder', 'rightShoulder'],
    phases: [
      {
        name: 'setup',
        angles: {
          hip: { min: 40, max: 80, optimal: 60 },
          knee: { min: 100, max: 140, optimal: 120 },
          back: { min: 0, max: 30, optimal: 15 },
        },
        cues: ['Bar over mid-foot', 'Lats engaged', 'Neutral spine'],
      },
      {
        name: 'lockout',
        angles: {
          hip: { min: 165, max: 180, optimal: 175 },
          knee: { min: 170, max: 180, optimal: 178 },
        },
        cues: ['Hips forward', 'Shoulders back', 'Stand tall'],
      },
    ],
    repDetection: { joint: 'hip', axis: 'angle', bottomThreshold: 90, topThreshold: 155 },
    commonErrors: [
      { id: 'rounded_back', description: 'Lower back rounding during pull', correction: 'Engage lats, maintain neutral spine, hinge from hips', affectedJoints: ['leftHip', 'rightHip'] },
      { id: 'bar_drift', description: 'Bar drifting away from body', correction: 'Keep bar path vertical, drag bar up shins', affectedJoints: ['leftShoulder', 'rightShoulder'] },
      { id: 'early_back_extension', description: 'Hyperextending at lockout', correction: 'Stop at vertical — do not lean back excessively', affectedJoints: ['leftHip', 'rightHip'] },
    ],
  },
  pushup: {
    name: 'Push-Up',
    joints: ['leftElbow', 'rightElbow', 'leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'],
    phases: [
      {
        name: 'bottom',
        angles: {
          elbow: { min: 80, max: 100, optimal: 90 },
          shoulder: { min: 40, max: 60, optimal: 45 },
        },
        cues: ['Chest to floor', 'Elbows at 45°', 'Core tight'],
      },
      {
        name: 'top',
        angles: {
          elbow: { min: 160, max: 180, optimal: 170 },
          shoulder: { min: 60, max: 100, optimal: 80 },
        },
        cues: ['Full arm extension', 'Don\'t lock elbows', 'Hollow body'],
      },
    ],
    repDetection: { joint: 'elbow', axis: 'angle', bottomThreshold: 110, topThreshold: 150 },
    commonErrors: [
      { id: 'flared_elbows', description: 'Elbows flaring out (>90° from torso)', correction: 'Tuck elbows to 45° from your body', affectedJoints: ['leftElbow', 'rightElbow'] },
      { id: 'hip_sag', description: 'Hips sagging below body line', correction: 'Squeeze glutes and brace core to maintain plank', affectedJoints: ['leftHip', 'rightHip'] },
      { id: 'partial_range', description: 'Not reaching full depth', correction: 'Lower until chest touches or nearly touches floor', affectedJoints: ['leftElbow', 'rightElbow'] },
    ],
  },
  lunge: {
    name: 'Lunge',
    joints: ['leftKnee', 'rightKnee', 'leftHip', 'rightHip'],
    phases: [
      {
        name: 'bottom',
        angles: {
          frontKnee: { min: 85, max: 95, optimal: 90 },
          backKnee: { min: 85, max: 95, optimal: 90 },
          trunk: { min: 0, max: 15, optimal: 5 },
        },
        cues: ['Both knees at 90°', 'Front knee over ankle', 'Torso upright'],
      },
    ],
    repDetection: { joint: 'knee', axis: 'angle', bottomThreshold: 110, topThreshold: 155 },
    commonErrors: [
      { id: 'knee_past_toe', description: 'Front knee passing too far over toes', correction: 'Step forward further, keep shin more vertical', affectedJoints: ['leftKnee', 'rightKnee'] },
      { id: 'forward_lean', description: 'Leaning forward excessively', correction: 'Keep torso upright, shoulders over hips', affectedJoints: ['leftHip', 'rightHip'] },
    ],
  },
  bicepCurl: {
    name: 'Bicep Curl',
    joints: ['leftElbow', 'rightElbow', 'leftShoulder', 'rightShoulder'],
    phases: [
      {
        name: 'top',
        angles: { elbow: { min: 30, max: 60, optimal: 45 }, shoulder: { min: 0, max: 20, optimal: 5 } },
        cues: ['Full contraction', 'Hold 1 second', 'Elbows stationary'],
      },
      {
        name: 'bottom',
        angles: { elbow: { min: 155, max: 180, optimal: 170 } },
        cues: ['Full extension', 'Don\'t swing', 'Slow descent'],
      },
    ],
    repDetection: { joint: 'elbow', axis: 'angle', bottomThreshold: 130, topThreshold: 80 },
    commonErrors: [
      { id: 'swinging', description: 'Using momentum/swinging body', correction: 'Keep elbows pinned to sides, use only forearm movement', affectedJoints: ['leftShoulder', 'rightShoulder'] },
      { id: 'partial_extension', description: 'Not fully extending at bottom', correction: 'Lower all the way for full range of motion', affectedJoints: ['leftElbow', 'rightElbow'] },
    ],
  },
  shoulderPress: {
    name: 'Shoulder Press',
    joints: ['leftElbow', 'rightElbow', 'leftShoulder', 'rightShoulder'],
    phases: [
      {
        name: 'bottom',
        angles: { elbow: { min: 85, max: 95, optimal: 90 }, shoulder: { min: 80, max: 100, optimal: 90 } },
        cues: ['Elbows at 90°', 'Wrists over elbows', 'Brace core'],
      },
      {
        name: 'top',
        angles: { elbow: { min: 160, max: 180, optimal: 170 } },
        cues: ['Full overhead extension', 'Head through', 'Lock arms'],
      },
    ],
    repDetection: { joint: 'elbow', axis: 'angle', bottomThreshold: 105, topThreshold: 145 },
    commonErrors: [
      { id: 'flared_elbows', description: 'Elbows flaring forward excessively', correction: 'Keep elbows at 45° angle, not straight forward', affectedJoints: ['leftElbow', 'rightElbow'] },
      { id: 'arching_back', description: 'Excessive lumbar arch', correction: 'Brace core and tuck pelvis slightly', affectedJoints: ['leftShoulder', 'rightShoulder'] },
    ],
  },
  plank: {
    name: 'Plank',
    joints: ['leftHip', 'rightHip', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow'],
    phases: [
      {
        name: 'hold',
        angles: {
          hip: { min: 160, max: 185, optimal: 175 },
          shoulder: { min: 80, max: 100, optimal: 90 },
        },
        cues: ['Neutral spine', 'Core braced', 'Squeeze glutes'],
      },
    ],
    repDetection: { joint: 'hip', axis: 'angle', bottomThreshold: 150, topThreshold: 170 },
    commonErrors: [
      { id: 'hip_sag', description: 'Hips sagging down', correction: 'Engage core and glutes to maintain straight body line', affectedJoints: ['leftHip', 'rightHip'] },
      { id: 'hip_pike', description: 'Hips piking up', correction: 'Lower hips until body is straight', affectedJoints: ['leftHip', 'rightHip'] },
    ],
  },
};

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

function computeAngle(
  a: { x: number; y: number },
  b: { x: number; y: number }, // vertex
  c: { x: number; y: number }
): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(radians * 180.0 / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return Math.round(angle);
}

function scoreAngle(angle: number, standard: { min: number; max: number; optimal: number }): number {
  if (angle >= standard.min && angle <= standard.max) {
    const deviation = Math.abs(angle - standard.optimal);
    const range = (standard.max - standard.min) / 2;
    return Math.max(0, 100 - (deviation / range) * 50);
  }
  // Out of range: heavy penalty
  const outsideBy = angle < standard.min ? standard.min - angle : angle - standard.max;
  return Math.max(0, 60 - outsideBy * 2);
}

// ─── GET /exercise-standards — List all exercises with their form standards ───
router.get('/exercise-standards', async (req: Request, res: Response) => {
  const exercises = Object.entries(EXERCISE_STANDARDS).map(([key, val]) => ({
    id: key,
    name: val.name,
    joints: val.joints,
    commonErrors: val.commonErrors,
    phasesCount: val.phases.length,
  }));
  res.json({ success: true, data: exercises });
});

// ─── GET /exercise-standards/:exerciseId — Full standard for one exercise ─────
router.get('/exercise-standards/:exerciseId', async (req: Request, res: Response) => {
  const standard = EXERCISE_STANDARDS[req.params.exerciseId];
  if (!standard) return res.status(404).json({ success: false, message: 'Exercise not found' });
  res.json({ success: true, data: { id: req.params.exerciseId, ...standard } });
});

// ─── POST /analyze-pose — Core endpoint: receive 17 MoveNet keypoints ─────────
// MoveNet SinglePose Lightning outputs 17 keypoints in order:
// [nose, leftEye, rightEye, leftEar, rightEar, leftShoulder, rightShoulder,
//  leftElbow, rightElbow, leftWrist, rightWrist, leftHip, rightHip,
//  leftKnee, rightKnee, leftAnkle, rightAnkle]
router.post('/analyze-pose', async (req: Request, res: Response) => {
  try {
    const { keypoints, exerciseId, repCount = 0 } = req.body;

    if (!keypoints || !Array.isArray(keypoints) || keypoints.length < 17) {
      return res.status(400).json({ success: false, message: 'Need 17 keypoints from MoveNet' });
    }

    const standard = EXERCISE_STANDARDS[exerciseId];
    if (!standard) {
      return res.status(400).json({ success: false, message: `Unknown exercise: ${exerciseId}` });
    }

    // Extract named keypoints (MoveNet order)
    const kp: Record<string, { x: number; y: number; score: number }> = {
      nose:          keypoints[0],
      leftEye:       keypoints[1],
      rightEye:      keypoints[2],
      leftEar:       keypoints[3],
      rightEar:      keypoints[4],
      leftShoulder:  keypoints[5],
      rightShoulder: keypoints[6],
      leftElbow:     keypoints[7],
      rightElbow:    keypoints[8],
      leftWrist:     keypoints[9],
      rightWrist:    keypoints[10],
      leftHip:       keypoints[11],
      rightHip:      keypoints[12],
      leftKnee:      keypoints[13],
      rightKnee:     keypoints[14],
      leftAnkle:     keypoints[15],
      rightAnkle:    keypoints[16],
    };

    // Compute key joint angles
    const angles: Record<string, number> = {};

    if (kp.leftHip && kp.leftKnee && kp.leftAnkle) {
      angles.leftKnee = computeAngle(kp.leftHip, kp.leftKnee, kp.leftAnkle);
    }
    if (kp.rightHip && kp.rightKnee && kp.rightAnkle) {
      angles.rightKnee = computeAngle(kp.rightHip, kp.rightKnee, kp.rightAnkle);
    }
    if (kp.leftShoulder && kp.leftHip && kp.leftKnee) {
      angles.leftHip = computeAngle(kp.leftShoulder, kp.leftHip, kp.leftKnee);
    }
    if (kp.rightShoulder && kp.rightHip && kp.rightKnee) {
      angles.rightHip = computeAngle(kp.rightShoulder, kp.rightHip, kp.rightKnee);
    }
    if (kp.leftShoulder && kp.leftElbow && kp.leftWrist) {
      angles.leftElbow = computeAngle(kp.leftShoulder, kp.leftElbow, kp.leftWrist);
    }
    if (kp.rightShoulder && kp.rightElbow && kp.rightWrist) {
      angles.rightElbow = computeAngle(kp.rightShoulder, kp.rightElbow, kp.rightWrist);
    }
    if (kp.leftElbow && kp.leftShoulder && kp.leftHip) {
      angles.leftShoulder = computeAngle(kp.leftElbow, kp.leftShoulder, kp.leftHip);
    }
    if (kp.rightElbow && kp.rightShoulder && kp.rightHip) {
      angles.rightShoulder = computeAngle(kp.rightElbow, kp.rightShoulder, kp.rightHip);
    }

    // Average left/right for bilateral exercises
    const avgAngles = {
      knee:     angles.leftKnee && angles.rightKnee     ? Math.round((angles.leftKnee + angles.rightKnee) / 2)         : (angles.leftKnee || angles.rightKnee),
      hip:      angles.leftHip && angles.rightHip       ? Math.round((angles.leftHip + angles.rightHip) / 2)           : (angles.leftHip || angles.rightHip),
      elbow:    angles.leftElbow && angles.rightElbow   ? Math.round((angles.leftElbow + angles.rightElbow) / 2)       : (angles.leftElbow || angles.rightElbow),
      shoulder: angles.leftShoulder && angles.rightShoulder ? Math.round((angles.leftShoulder + angles.rightShoulder) / 2) : (angles.leftShoulder || angles.rightShoulder),
    };

    // Determine current phase
    const isBottomPhase = (exerciseId === 'squat' || exerciseId === 'deadlift')
      ? (avgAngles.hip || 180) < 130
      : (exerciseId === 'pushup' || exerciseId === 'bicepCurl' || exerciseId === 'shoulderPress')
        ? (avgAngles.elbow || 180) < 110
        : false;

    const currentPhase = standard.phases[isBottomPhase ? 0 : standard.phases.length > 1 ? 1 : 0];

    // Score each joint angle in the current phase
    const jointScores: Record<string, number> = {};
    let totalScore = 0;
    let scoreCount = 0;

    for (const [jointKey, angleStandard] of Object.entries(currentPhase.angles)) {
      const measuredAngle = avgAngles[jointKey as keyof typeof avgAngles];
      if (measuredAngle !== undefined) {
        const score = scoreAngle(measuredAngle, angleStandard);
        jointScores[jointKey] = score;
        totalScore += score;
        scoreCount++;
      }
    }

    const overallScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 75;

    // Check for triggered errors
    const triggeredErrors: typeof standard.commonErrors = [];

    // Squat-specific checks
    if (exerciseId === 'squat') {
      // Knee cave: check if knees angle inward relative to hips
      if (kp.leftKnee && kp.leftHip && kp.leftAnkle) {
        const kneeX = kp.leftKnee.x;
        const hipX  = kp.leftHip.x;
        const ankleX = kp.leftAnkle.x;
        if (Math.abs(kneeX - hipX) < Math.abs(ankleX - hipX) * 0.7) {
          const err = standard.commonErrors.find(e => e.id === 'knee_cave');
          if (err) triggeredErrors.push(err);
        }
      }
      // Shallow depth check
      if (avgAngles.hip && avgAngles.hip > 100 && isBottomPhase) {
        const err = standard.commonErrors.find(e => e.id === 'shallow_depth');
        if (err) triggeredErrors.push(err);
      }
    }

    // Generic: if a joint angle is out of range, find matching error
    for (const error of standard.commonErrors) {
      if (triggeredErrors.find(e => e.id === error.id)) continue;
      for (const affectedJoint of error.affectedJoints) {
        const normalizedJoint = affectedJoint.replace('left', '').replace('right', '').toLowerCase();
        const angle = avgAngles[normalizedJoint as keyof typeof avgAngles];
        const phaseStandard = currentPhase.angles[normalizedJoint];
        if (angle !== undefined && phaseStandard) {
          if (angle < phaseStandard.min - 20 || angle > phaseStandard.max + 20) {
            triggeredErrors.push(error);
            break;
          }
        }
      }
    }

    // Determine color coding per joint: green (good), yellow (borderline), red (bad)
    const jointStatus: Record<string, 'good' | 'warning' | 'error'> = {};
    for (const [joint, score] of Object.entries(jointScores)) {
      jointStatus[joint] = score >= 80 ? 'good' : score >= 55 ? 'warning' : 'error';
    }

    res.json({
      success: true,
      data: {
        exerciseId,
        overallScore,
        currentPhase: currentPhase.name,
        cues: currentPhase.cues,
        jointAngles: avgAngles,
        rawAngles: angles,
        jointScores,
        jointStatus,
        triggeredErrors: triggeredErrors.map(e => ({
          id: e.id,
          description: e.description,
          correction: e.correction,
        })),
        formGrade: overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 55 ? 'D' : 'F',
        repCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /save-form-result — Save a completed form session ───────────────────
router.post('/save-form-result', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = (req as any).user._id;
    const { exerciseId, totalReps, avgFormScore, repScores, errorsSeen, durationSeconds, notes } = req.body;

    const FormSession = require('../models/FormSession.model').default;

    // Try to save; model may not exist yet — create inline schema
    let session;
    try {
      session = await FormSession.create({
        tenantId, memberId, exerciseId,
        exerciseName: EXERCISE_STANDARDS[exerciseId]?.name || exerciseId,
        totalReps, avgFormScore,
        repScores: repScores || [],
        errorsSeen: errorsSeen || [],
        durationSeconds, notes,
      });
    } catch (modelErr: any) {
      // FormSession model may not exist; create a minimal record using a generic collection
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      if (db) {
        const result = await db.collection('formsessions').insertOne({
          tenantId: tenantId?.toString(), memberId: memberId?.toString(),
          exerciseId, totalReps, avgFormScore, repScores, errorsSeen, durationSeconds, notes,
          createdAt: new Date(),
        });
        return res.json({ success: true, data: { id: result.insertedId, avgFormScore, totalReps } });
      }
    }

    res.json({ success: true, data: { id: session?._id, avgFormScore, totalReps } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /my-form-history — Member's form improvement over time ───────────────
router.get('/my-form-history', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = (req as any).user._id;
    const { exerciseId, limit = 20 } = req.query;

    try {
      const FormSession = require('../models/FormSession.model').default;
      const query: any = { tenantId, memberId };
      if (exerciseId) query.exerciseId = exerciseId;
      const history = await FormSession.find(query).sort({ createdAt: -1 }).limit(Number(limit)).lean();
      return res.json({ success: true, data: history });
    } catch {
      // Fallback to raw collection
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      const query: any = { tenantId: tenantId?.toString(), memberId: memberId?.toString() };
      if (exerciseId) query.exerciseId = exerciseId;
      const history = await db.collection('formsessions').find(query).sort({ createdAt: -1 }).limit(Number(limit)).toArray();
      return res.json({ success: true, data: history });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /leaderboard — Top members by average form score this month ──────────
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { exerciseId } = req.query;
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    try {
      const FormSession = require('../models/FormSession.model').default;
      const matchQuery: any = { tenantId, createdAt: { $gte: monthStart } };
      if (exerciseId) matchQuery.exerciseId = exerciseId;

      const leaderboard = await FormSession.aggregate([
        { $match: matchQuery },
        { $group: { _id: '$memberId', avgScore: { $avg: '$avgFormScore' }, sessions: { $sum: 1 } } },
        { $sort: { avgScore: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'members', localField: '_id', foreignField: '_id', as: 'member' } },
        { $unwind: { path: '$member', preserveNullAndEmpty: true } },
        { $project: { memberId: '$_id', avgScore: { $round: ['$avgScore', 1] }, sessions: 1, memberName: '$member.fullName' } },
      ]);
      res.json({ success: true, data: leaderboard });
    } catch {
      res.json({ success: true, data: [] });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
