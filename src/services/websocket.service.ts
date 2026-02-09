import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import User from '../models/User.model';

interface AuthenticatedSocket extends Socket {
    userId?: string;
    tenantId?: string;
    branchId?: string;
    role?: string;
}

export class WebSocketService {
    private io: Server;
    private connectedUsers: Map<string, string> = new Map(); // userId -> socketId

    constructor(httpServer: HTTPServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: config.cors.origin,
                credentials: true,
            },
            pingTimeout: 60000,
            pingInterval: 25000,
        });

        this.setupMiddleware();
        this.setupEventHandlers();
    }

    // Authentication middleware
    private setupMiddleware() {
        this.io.use(async (socket: AuthenticatedSocket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

                if (!token) {
                    return next(new Error('Authentication token required'));
                }

                const decoded = jwt.verify(token, config.jwt.secret) as any;
                const user = await User.findById(decoded.userId);

                if (!user || !user.isActive) {
                    return next(new Error('User not found or inactive'));
                }

                socket.userId = user._id.toString();
                if (user.tenantId) socket.tenantId = user.tenantId.toString();
                if (user.branchId) socket.branchId = user.branchId.toString();
                socket.role = user.role;

                next();
            } catch (error) {
                next(new Error('Invalid authentication token'));
            }
        });
    }

    // Setup event handlers
    private setupEventHandlers() {
        this.io.on('connection', (socket: AuthenticatedSocket) => {
            console.log(`User connected: ${socket.userId} (${socket.role})`);

            // Store connection
            if (socket.userId) {
                this.connectedUsers.set(socket.userId, socket.id);
            }

            // Join tenant and branch rooms
            if (socket.tenantId) {
                socket.join(`tenant:${socket.tenantId}`);
            }
            if (socket.branchId) {
                socket.join(`branch:${socket.branchId}`);
            }

            // Join role-specific room
            if (socket.role) {
                socket.join(`role:${socket.role}`);
            }

            // Handle attendance events
            socket.on('attendance:checkin', (data) => this.handleCheckIn(socket, data));
            socket.on('attendance:checkout', (data) => this.handleCheckOut(socket, data));

            // Handle notification events
            socket.on('notification:read', (data) => this.handleNotificationRead(socket, data));

            // Handle trainer availability
            socket.on('trainer:updateAvailability', (data) => this.handleTrainerAvailability(socket, data));

            // Handle live chat
            socket.on('chat:message', (data) => this.handleChatMessage(socket, data));
            socket.on('chat:typing', (data) => this.handleTyping(socket, data));

            // Handle disconnect
            socket.on('disconnect', () => {
                console.log(`User disconnected: ${socket.userId}`);
                if (socket.userId) {
                    this.connectedUsers.delete(socket.userId);
                }
            });
        });
    }

    // Attendance check-in handler
    private handleCheckIn(socket: AuthenticatedSocket, data: any) {
        // Broadcast to branch
        if (socket.branchId) {
            this.io.to(`branch:${socket.branchId}`).emit('attendance:update', {
                type: 'checkin',
                memberId: data.memberId,
                timestamp: new Date(),
                method: data.method,
            });
        }

        // Update live attendance count
        this.broadcastLiveMetrics(socket.branchId!);
    }

    // Attendance check-out handler
    private handleCheckOut(socket: AuthenticatedSocket, data: any) {
        // Broadcast to branch
        if (socket.branchId) {
            this.io.to(`branch:${socket.branchId}`).emit('attendance:update', {
                type: 'checkout',
                memberId: data.memberId,
                timestamp: new Date(),
                duration: data.duration,
            });
        }

        // Update live attendance count
        this.broadcastLiveMetrics(socket.branchId!);
    }

    // Notification read handler
    private handleNotificationRead(socket: AuthenticatedSocket, data: any) {
        // Mark notification as read (would call NotificationService)
        console.log(`Notification ${data.notificationId} read by ${socket.userId}`);
    }

    // Trainer availability handler
    private handleTrainerAvailability(socket: AuthenticatedSocket, data: any) {
        // Broadcast to branch
        if (socket.branchId) {
            this.io.to(`branch:${socket.branchId}`).emit('trainer:availabilityUpdate', {
                trainerId: socket.userId,
                availability: data.availability,
                timestamp: new Date(),
            });
        }
    }

    // Chat message handler
    private handleChatMessage(socket: AuthenticatedSocket, data: any) {
        const { recipientId, message } = data;

        // Send to specific user
        const recipientSocketId = this.connectedUsers.get(recipientId);
        if (recipientSocketId) {
            this.io.to(recipientSocketId).emit('chat:newMessage', {
                senderId: socket.userId,
                message,
                timestamp: new Date(),
            });
        }

        // Send confirmation to sender
        socket.emit('chat:messageSent', {
            recipientId,
            message,
            timestamp: new Date(),
        });
    }

    // Typing indicator handler
    private handleTyping(socket: AuthenticatedSocket, data: any) {
        const { recipientId, isTyping } = data;

        const recipientSocketId = this.connectedUsers.get(recipientId);
        if (recipientSocketId) {
            this.io.to(recipientSocketId).emit('chat:typing', {
                senderId: socket.userId,
                isTyping,
            });
        }
    }

    // Broadcast live metrics to dashboard
    private async broadcastLiveMetrics(branchId: string) {
        // This would fetch real-time metrics from database
        // For now, just emit event
        this.io.to(`branch:${branchId}`).emit('metrics:update', {
            timestamp: new Date(),
        });
    }

    // Public methods to emit events from services

    // Send notification to user
    public sendNotification(userId: string, notification: any) {
        const socketId = this.connectedUsers.get(userId);
        if (socketId) {
            this.io.to(socketId).emit('notification:new', notification);
        }
    }

    // Broadcast to tenant
    public broadcastToTenant(tenantId: string, event: string, data: any) {
        this.io.to(`tenant:${tenantId}`).emit(event, data);
    }

    // Broadcast to branch
    public broadcastToBranch(branchId: string, event: string, data: any) {
        this.io.to(`branch:${branchId}`).emit(event, data);
    }

    // Broadcast to role
    public broadcastToRole(role: string, event: string, data: any) {
        this.io.to(`role:${role}`).emit(event, data);
    }

    // Send to specific user
    public sendToUser(userId: string, event: string, data: any) {
        const socketId = this.connectedUsers.get(userId);
        if (socketId) {
            this.io.to(socketId).emit(event, data);
        }
    }

    // Get connected users count
    public getConnectedUsersCount(): number {
        return this.connectedUsers.size;
    }

    // Get connected users in branch
    public async getConnectedUsersInBranch(branchId: string): Promise<number> {
        const sockets = await this.io.in(`branch:${branchId}`).fetchSockets();
        return sockets.length;
    }

    // Check if user is online
    public isUserOnline(userId: string): boolean {
        return this.connectedUsers.has(userId);
    }
}

export default WebSocketService;
