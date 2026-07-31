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
        // Same CORS as the Express app: allow configured origins + LAN IPs in dev
        const wsOrigin = config.env === 'development'
            ? (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
                if (!origin) { cb(null, true); return; }
                const ok = config.cors.origin.includes(origin)
                    || /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin);
                cb(ok ? null : new Error('WS CORS blocked'), ok);
              }
            : config.cors.origin;

        this.io = new Server(httpServer, {
            cors: {
                origin: wsOrigin,
                credentials: true,
            },
            pingTimeout: 60000,
            pingInterval: 25000,
        });

        this.setupMiddleware();
        this.setupEventHandlers();
        this.setupVideoSignaling();
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

    // ─── WebRTC P2P Video Signaling (/gymvideo namespace) ─────────────────────
    // No JWT required — peers are anonymous; room access is by roomId only.
    private setupVideoSignaling() {
        const videoNs = this.io.of('/gymvideo');

        // In-memory room state (same pattern as reference DoconCall server)
        const channels: Record<string, Record<string, any>>    = {}; // roomId -> socketId -> socket
        const peers:    Record<string, Record<string, any>>    = {}; // roomId -> socketId -> peer info
        const presenters: Record<string, Record<string, any>>  = {}; // roomId -> socketId -> presenter info

        // Allow any origin for the video namespace in dev
        videoNs.use((_socket, next) => next());

        videoNs.on('connection', (socket) => {

            // ── join ──────────────────────────────────────────────────────────
            socket.on('join', async (cfg: any) => {
                const {
                    channel, channel_password, peer_uuid, peer_name,
                    peer_video, peer_audio,
                    peer_video_status, peer_audio_status, peer_screen_status,
                    peer_hold_status, peer_hand_status, peer_rec_status, peer_privacy_status,
                    peer_info = {},
                } = cfg ?? {};

                if (!channel) return;
                if ((socket as any).channels?.[channel]) return; // already joined

                if (!channels[channel])   channels[channel]   = {};
                if (!peers[channel])      peers[channel]      = {};
                if (!presenters[channel]) presenters[channel] = {};

                // Check room lock
                if (peers[channel]['_lock'] === true && peers[channel]['_password'] !== channel_password) {
                    socket.emit('roomIsLocked');
                    return;
                }

                // Presenter = first joiner (or stays presenter across reconnect)
                const isPresenter = Object.keys(presenters[channel]).length === 0;
                if (isPresenter) {
                    presenters[channel][socket.id] = { peer_name, peer_uuid, is_presenter: true };
                }

                peers[channel][socket.id] = {
                    peer_name, peer_uuid, peer_presenter: isPresenter,
                    peer_video, peer_audio,
                    peer_video_status, peer_audio_status, peer_screen_status,
                    peer_hold_status, peer_hand_status, peer_rec_status, peer_privacy_status,
                    os: peer_info.osName ? `${peer_info.osName} ${peer_info.osVersion}` : '',
                    browser: peer_info.browserName ? `${peer_info.browserName} ${peer_info.browserVersion}` : '',
                };

                // Notify existing peers of the new joiner and vice-versa
                for (const id in channels[channel]) {
                    channels[channel][id].emit('addPeer', { peer_id: socket.id, peers: peers[channel], should_create_offer: false });
                    socket.emit('addPeer',              { peer_id: id,           peers: peers[channel], should_create_offer: true });
                }

                channels[channel][socket.id] = socket;
                (socket as any).channels = (socket as any).channels ?? {};
                (socket as any).channels[channel] = channel;

                socket.emit('serverInfo', {
                    peers_count: Object.keys(peers[channel]).length,
                    is_presenter: isPresenter,
                });
            });

            // ── ICE / SDP relay ───────────────────────────────────────────────
            socket.on('relayICE', ({ peer_id, ice_candidate }: any) => {
                const s = videoNs.sockets.get(peer_id);
                if (s) s.emit('iceCandidate', { peer_id: socket.id, ice_candidate });
            });

            socket.on('relaySDP', ({ peer_id, session_description }: any) => {
                const s = videoNs.sockets.get(peer_id);
                if (s) s.emit('sessionDescription', { peer_id: socket.id, session_description });
            });

            // ── Room lock / password ──────────────────────────────────────────
            socket.on('roomAction', ({ room_id, peer_id, peer_name, peer_uuid, password, action }: any) => {
                if (!peers[room_id]) return;
                const isPresenter = !!(presenters[room_id]?.[peer_id]);
                switch (action) {
                    case 'lock':
                        if (!isPresenter) return;
                        peers[room_id]['_lock'] = true;
                        peers[room_id]['_password'] = password;
                        broadcastToRoom(room_id, 'roomAction', { peer_name, action });
                        break;
                    case 'unlock':
                        if (!isPresenter) return;
                        delete peers[room_id]['_lock'];
                        delete peers[room_id]['_password'];
                        broadcastToRoom(room_id, 'roomAction', { peer_name, action });
                        break;
                    case 'checkPassword':
                        socket.emit('roomAction', {
                            peer_name, action,
                            password: password === peers[room_id]['_password'] ? 'OK' : 'KO',
                        });
                        break;
                }
            });

            // ── Peer name change ──────────────────────────────────────────────
            socket.on('peerName', ({ room_id, peer_name_old, peer_name_new }: any) => {
                if (!peers[room_id]) return;
                for (const id in peers[room_id]) {
                    if (peers[room_id][id]?.peer_name === peer_name_old && id === socket.id) {
                        peers[room_id][id].peer_name = peer_name_new;
                        if (presenters[room_id]?.[id]) presenters[room_id][id].peer_name = peer_name_new;
                        broadcastToRoom(room_id, 'peerName', { peer_id: socket.id, peer_name: peer_name_new });
                        break;
                    }
                }
            });

            // ── Chat message ──────────────────────────────────────────────────
            socket.on('message', (data: any) => {
                if (!data?.room_id) return;
                broadcastToRoom(data.room_id, 'message', data);
            });

            // ── Peer media status ─────────────────────────────────────────────
            socket.on('peerStatus', ({ room_id, peer_id, peer_name, element, status }: any) => {
                if (!peers[room_id]?.[peer_id]) return;
                const statusMap: Record<string, string> = {
                    video: 'peer_video_status', audio: 'peer_audio_status',
                    screen: 'peer_screen_status', hand: 'peer_hand_status',
                    rec: 'peer_rec_status', privacy: 'peer_privacy_status',
                    hold: 'peer_hold_status', unhold: 'peer_unhold_status',
                };
                if (statusMap[element]) peers[room_id][peer_id][statusMap[element]] = status;
                broadcastToRoom(room_id, 'peerStatus', { peer_id, peer_name, element, status });
            });

            // ── Peer action (host controls) ───────────────────────────────────
            // peer_id = target peer (used when send_to_all:false); authority always verified by socket.id
            socket.on('peerAction', ({ room_id, peer_id, peer_name, peer_use_video, peer_action, send_to_all }: any) => {
                if (!peers[room_id]) return;
                const presenterActions = ['muteAudio', 'hideVideo', 'ejectAll', 'holdPeer', 'unholdPeer'];
                if (presenterActions.includes(peer_action)) {
                    if (!presenters[room_id]?.[socket.id]) return; // verify sender is presenter
                }
                const payload = { peer_id: socket.id, peer_name, peer_action, peer_use_video };
                if (send_to_all) {
                    broadcastToRoom(room_id, 'peerAction', payload);
                } else {
                    const target = videoNs.sockets.get(peer_id); // peer_id = the target
                    if (target) target.emit('peerAction', payload);
                }
            });

            // ── Kick out ──────────────────────────────────────────────────────
            socket.on('kickOut', ({ room_id, peer_id, peer_name }: any) => {
                if (!presenters[room_id]?.[socket.id]) return;
                const target = videoNs.sockets.get(peer_id);
                if (target) target.emit('kickOut', { peer_name });
            });

            // ── File transfer signaling ───────────────────────────────────────
            socket.on('fileInfo', ({ room_id, peer_id, peer_name, broadcast, file }: any) => {
                if (broadcast) broadcastToRoom(room_id, 'fileInfo', { room_id, peer_id, peer_name, broadcast, file });
                else {
                    const t = videoNs.sockets.get(peer_id);
                    if (t) t.emit('fileInfo', { room_id, peer_id, peer_name, broadcast, file });
                }
            });
            socket.on('fileAbort',        ({ room_id }: any) => broadcastToRoom(room_id, 'fileAbort'));
            socket.on('fileReceiveAbort', (cfg: any)        => broadcastToRoom(cfg.room_id, 'fileReceiveAbort', cfg));

            // ── Shared video URL ──────────────────────────────────────────────
            socket.on('videoPlayer', ({ room_id, peer_id, peer_name, video_action, video_src }: any) => {
                const payload = { peer_id: socket.id, peer_name, video_action, video_src };
                if (peer_id) {
                    const t = videoNs.sockets.get(peer_id);
                    if (t) t.emit('videoPlayer', payload);
                } else {
                    broadcastToRoom(room_id, 'videoPlayer', payload);
                }
            });

            // ── Whiteboard ────────────────────────────────────────────────────
            socket.on('wbCanvasToJson',   (cfg: any) => broadcastToRoom(cfg.room_id, 'wbCanvasToJson', cfg));
            socket.on('whiteboardAction', (cfg: any) => broadcastToRoom(cfg.room_id, 'whiteboardAction', cfg));

            // ── Disconnect ────────────────────────────────────────────────────
            socket.on('disconnect', () => {
                const socketChannels: Record<string, string> = (socket as any).channels ?? {};
                for (const channel of Object.keys(socketChannels)) {
                    const wasPresenter = !!(presenters[channel]?.[socket.id]);

                    // Cleanup
                    delete channels[channel]?.[socket.id];
                    delete peers[channel]?.[socket.id];
                    delete presenters[channel]?.[socket.id];

                    if (channels[channel] && Object.keys(channels[channel]).length === 0) {
                        delete channels[channel];
                        delete peers[channel];
                        delete presenters[channel];
                    }

                    // If the presenter left, redirect all remaining peers
                    if (wasPresenter && channels[channel]) {
                        for (const id in channels[channel]) {
                            channels[channel][id].emit('customRedirect', { url: '/classes' });
                        }
                        delete channels[channel];
                        delete peers[channel];
                        delete presenters[channel];
                    } else if (channels[channel]) {
                        // Notify remaining peers this peer left
                        for (const id in channels[channel]) {
                            channels[channel][id].emit('removePeer', { peer_id: socket.id });
                        }
                        socket.emit('removePeer', { peer_id: socket.id });
                    }
                }
            });

            // ── Helpers ───────────────────────────────────────────────────────
            function broadcastToRoom(room_id: string, event: string, data: any = {}) {
                if (!channels[room_id]) return;
                for (const id in channels[room_id]) {
                    if (id !== socket.id) channels[room_id][id].emit(event, data);
                }
            }
        });
    }
}

export default WebSocketService;
