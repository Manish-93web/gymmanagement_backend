import mongoose from 'mongoose';
import Exercise, { IExercise } from '../models/Exercise.model';
import Workout, { IWorkout } from '../models/Workout.model';
import WorkoutLog, { IWorkoutLog } from '../models/WorkoutLog.model';

export interface CreateExerciseDTO {
    tenantId: string;
    name: string;
    description?: string;
    category: 'strength' | 'cardio' | 'flexibility' | 'balance' | 'plyometric' | 'olympic' | 'powerlifting';
    muscleGroups: {
        primary: string[];
        secondary: string[];
    };
    equipment: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    instructions?: string[];
    videoUrl?: string;
    imageUrl?: string;
}

export interface CreateWorkoutDTO {
    tenantId: string;
    branchId: string;
    memberId: string;
    trainerId?: string;
    name: string;
    description?: string;
    goal: 'strength' | 'hypertrophy' | 'endurance' | 'weight_loss' | 'general_fitness';
    exercises: {
        exerciseId: string;
        sets: number;
        reps?: number;
        duration?: number;
        weight?: number;
        restTime: number;
        notes?: string;
    }[];
    schedule?: {
        daysOfWeek: number[];
        startDate: Date;
        endDate?: Date;
    };
}

export interface LogWorkoutDTO {
    tenantId: string;
    branchId: string;
    memberId: string;
    workoutId?: string;
    date: Date;
    exercises: {
        exerciseId: string;
        sets: {
            reps?: number;
            weight?: number;
            duration?: number;
            completed: boolean;
        }[];
        notes?: string;
    }[];
    totalDuration?: number;
    caloriesBurned?: number;
    notes?: string;
}

export class WorkoutService {
    // Create exercise
    async createExercise(data: CreateExerciseDTO): Promise<IExercise> {
        const exercise = await Exercise.create(data);
        return exercise;
    }

    // Get exercise by ID
    async getExerciseById(exerciseId: string, tenantId: string): Promise<IExercise | null> {
        return await Exercise.findOne({ _id: exerciseId, tenantId });
    }

    // Get exercises
    async getExercises(
        tenantId: string,
        category?: string,
        muscleGroup?: string,
        difficulty?: string,
        equipment?: string,
        search?: string,
        page: number = 1,
        limit: number = 50
    ): Promise<{ exercises: IExercise[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { tenantId };
        if (category) filter.category = category;
        if (muscleGroup) {
            filter.$or = [
                { 'muscleGroups.primary': muscleGroup },
                { 'muscleGroups.secondary': muscleGroup },
            ];
        }
        if (difficulty) filter.difficulty = difficulty;
        if (equipment) filter.equipment = equipment;
        if (search) {
            filter.name = { $regex: search, $options: 'i' };
        }

        const [exercises, total] = await Promise.all([
            Exercise.find(filter).skip(skip).limit(limit).sort({ name: 1 }),
            Exercise.countDocuments(filter),
        ]);

        return { exercises, total };
    }

    // Create workout plan
    async createWorkout(data: CreateWorkoutDTO): Promise<IWorkout> {
        const workout = await Workout.create(data);
        return workout;
    }

    // Get workout by ID
    async getWorkoutById(workoutId: string, tenantId: string): Promise<IWorkout | null> {
        return await Workout.findOne({ _id: workoutId, tenantId })
            .populate('exercises.exerciseId')
            .populate('trainerId', 'firstName lastName')
            .populate('memberId', 'firstName lastName membershipNumber');
    }

    // Get member workouts
    async getMemberWorkouts(
        memberId: string,
        tenantId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<IWorkout[]> {
        const filter: any = { memberId, tenantId };
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = startDate;
            if (endDate) filter.createdAt.$lte = endDate;
        }

        return await Workout.find(filter)
            .populate('exercises.exerciseId')
            .populate('trainerId', 'firstName lastName')
            .sort({ createdAt: -1 });
    }

    // Get all workouts (for library)
    async getWorkouts(
        tenantId: string,
        category?: string,
        level?: string,
        search?: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ workouts: IWorkout[]; total: number }> {
        const skip = (page - 1) * limit;
        const filter: any = { tenantId };

        if (category) filter.category = category;
        if (level) filter.level = level;
        if (search) {
            filter.name = { $regex: search, $options: 'i' };
        }

        const [workouts, total] = await Promise.all([
            Workout.find(filter)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .populate('exercises.exerciseId')
                .populate('trainerId', 'firstName lastName'),
            Workout.countDocuments(filter),
        ]);

        return { workouts, total };
    }

    // Update workout
    async updateWorkout(workoutId: string, tenantId: string, data: Partial<CreateWorkoutDTO>): Promise<IWorkout | null> {
        return await Workout.findOneAndUpdate(
            { _id: workoutId, tenantId },
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    // Log workout
    async logWorkout(data: LogWorkoutDTO): Promise<IWorkoutLog> {
        // Check for PRs
        const exercisesWithPRs = await Promise.all(
            data.exercises.map(async (exercise) => {
                const maxWeight = Math.max(...exercise.sets.map(s => s.weight || 0));
                const maxReps = Math.max(...exercise.sets.map(s => s.reps || 0));

                // Find previous best
                const previousBest = await WorkoutLog.findOne({
                    memberId: data.memberId,
                    'exercises.exerciseId': exercise.exerciseId,
                }).sort({ date: -1 });

                let isPR = false;
                if (previousBest) {
                    const prevExercise = previousBest.exercises.find(
                        e => e.exerciseId.toString() === exercise.exerciseId
                    );
                    if (prevExercise) {
                        const prevMaxWeight = Math.max(...prevExercise.sets.map(s => s.weight || 0));
                        const prevMaxReps = Math.max(...prevExercise.sets.map(s => s.reps || 0));
                        isPR = maxWeight > prevMaxWeight || (maxWeight === prevMaxWeight && maxReps > prevMaxReps);
                    }
                } else {
                    isPR = true; // First time doing this exercise
                }

                return {
                    ...exercise,
                    personalRecord: isPR ? { weight: maxWeight, reps: maxReps, date: data.date } : undefined,
                };
            })
        );

        const workoutLog = await WorkoutLog.create({
            ...data,
            exercises: exercisesWithPRs,
        });

        return workoutLog;
    }

    // Get workout logs
    async getWorkoutLogs(
        memberId: string,
        tenantId: string,
        startDate?: Date,
        endDate?: Date,
        page: number = 1,
        limit: number = 20
    ): Promise<{ logs: IWorkoutLog[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { memberId, tenantId };
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = startDate;
            if (endDate) filter.date.$lte = endDate;
        }

        const [logs, total] = await Promise.all([
            WorkoutLog.find(filter)
                .skip(skip)
                .limit(limit)
                .sort({ date: -1 })
                .populate('exercises.exerciseId'),
            WorkoutLog.countDocuments(filter),
        ]);

        return { logs, total };
    }

    // Get workout statistics
    async getWorkoutStats(memberId: string, tenantId: string): Promise<any> {
        const totalWorkouts = await WorkoutLog.countDocuments({ memberId, tenantId });

        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);

        const recentWorkouts = await WorkoutLog.countDocuments({
            memberId,
            tenantId,
            date: { $gte: last30Days },
        });

        const totalDuration = await WorkoutLog.aggregate([
            { $match: { memberId: new mongoose.Types.ObjectId(memberId), tenantId } },
            { $group: { _id: null, total: { $sum: '$totalDuration' } } },
        ]);

        const totalCalories = await WorkoutLog.aggregate([
            { $match: { memberId: new mongoose.Types.ObjectId(memberId), tenantId } },
            { $group: { _id: null, total: { $sum: '$caloriesBurned' } } },
        ]);

        return {
            totalWorkouts,
            recentWorkouts,
            totalDuration: totalDuration[0]?.total || 0,
            totalCalories: totalCalories[0]?.total || 0,
            averagePerWeek: (recentWorkouts / 4).toFixed(1),
        };
    }

    // Get personal records
    async getPersonalRecords(memberId: string, tenantId: string): Promise<any[]> {
        const logs = await WorkoutLog.find({ memberId, tenantId })
            .populate('exercises.exerciseId')
            .sort({ date: -1 });

        const prMap = new Map<string, any>();

        logs.forEach((log: any) => {
            log.exercises.forEach((exercise: any) => {
                if (exercise.personalRecord) {
                    const exerciseId = exercise.exerciseId.toString();
                    const existingPR = prMap.get(exerciseId);

                    if (!existingPR || (exercise.personalRecord.weight || 0) > (existingPR.weight || 0)) {
                        prMap.set(exerciseId, {
                            exercise: exercise.exerciseId,
                            ...exercise.personalRecord,
                        });
                    }
                }
            });
        });

        return Array.from(prMap.values());
    }
}

export default new WorkoutService();
