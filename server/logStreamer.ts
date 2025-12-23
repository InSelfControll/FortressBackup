/**
 * LogStreamer - Real-time log streaming service using Server-Sent Events (SSE)
 * Handles live streaming of backup job logs to connected clients
 */

import { EventEmitter } from 'events';
import { Response } from 'express';

export interface LogEntry {
    jobId: string;
    type: 'info' | 'success' | 'error' | 'progress' | 'warning';
    message: string;
    timestamp: Date;
}

// Global event emitter for log broadcasting
const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(100); // Allow many concurrent subscribers

// Store active SSE connections per job
const activeConnections = new Map<string, Set<Response>>();

/**
 * Subscribe a client to job logs via SSE
 */
export function subscribeToJobLogs(jobId: string, res: Response): void {
    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Add connection to active set
    if (!activeConnections.has(jobId)) {
        activeConnections.set(jobId, new Set());
    }
    activeConnections.get(jobId)!.add(res);

    // Send initial connection message
    sendSSEMessage(res, {
        type: 'info',
        message: 'Connected to log stream',
        timestamp: new Date()
    });

    // Cleanup on disconnect
    res.on('close', () => {
        const connections = activeConnections.get(jobId);
        if (connections) {
            connections.delete(res);
            if (connections.size === 0) {
                activeConnections.delete(jobId);
            }
        }
    });
}

/**
 * Send a single SSE message to a response
 */
function sendSSEMessage(res: Response, log: Omit<LogEntry, 'jobId'>): void {
    const data = JSON.stringify({
        type: log.type,
        message: log.message,
        timestamp: log.timestamp.toISOString()
    });
    res.write(`data: ${data}\n\n`);
}

/**
 * Broadcast a log entry to all subscribers of a job
 */
export function broadcastJobLog(jobId: string, type: LogEntry['type'], message: string): void {
    const log: LogEntry = {
        jobId,
        type,
        message,
        timestamp: new Date()
    };

    // Emit for internal listeners
    logEmitter.emit(`job:${jobId}`, log);

    // Send to all SSE subscribers
    const connections = activeConnections.get(jobId);
    if (connections) {
        const data = JSON.stringify({
            type: log.type,
            message: log.message,
            timestamp: log.timestamp.toISOString()
        });
        connections.forEach(res => {
            try {
                res.write(`data: ${data}\n\n`);
            } catch (e) {
                // Connection closed, will be cleaned up
            }
        });
    }
}

/**
 * Notify all subscribers that a job has completed
 */
export function notifyJobComplete(jobId: string, success: boolean): void {
    const connections = activeConnections.get(jobId);
    if (connections) {
        const data = JSON.stringify({
            type: 'complete',
            success,
            message: success ? 'Job completed successfully' : 'Job failed',
            timestamp: new Date().toISOString()
        });
        connections.forEach(res => {
            try {
                res.write(`data: ${data}\n\n`);
                res.end();
            } catch (e) {
                // Ignore
            }
        });
        activeConnections.delete(jobId);
    }
}

/**
 * Get count of active subscribers for a job
 */
export function getSubscriberCount(jobId: string): number {
    return activeConnections.get(jobId)?.size || 0;
}

/**
 * Subscribe to log events programmatically (not via SSE)
 */
export function onJobLog(jobId: string, callback: (log: LogEntry) => void): () => void {
    const handler = (log: LogEntry) => callback(log);
    logEmitter.on(`job:${jobId}`, handler);

    // Return unsubscribe function
    return () => {
        logEmitter.off(`job:${jobId}`, handler);
    };
}

/**
 * Create a log callback function for use with BackupExecutor
 */
export function createJobLogger(jobId: string) {
    return (log: { type: string; message: string; timestamp: Date }) => {
        broadcastJobLog(jobId, log.type as LogEntry['type'], log.message);
    };
}

export default {
    subscribeToJobLogs,
    broadcastJobLog,
    notifyJobComplete,
    getSubscriberCount,
    onJobLog,
    createJobLogger
};
