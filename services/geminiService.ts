
import { GoogleGenAI, Type } from "@google/genai";
import { BackupTool } from '../types';

// FIX: Initialized GoogleGenAI with API_KEY directly from environment as per strict guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const backupConfigSchema = {
  type: Type.OBJECT,
  properties: {
    tool: {
      type: Type.STRING,
      enum: [BackupTool.BORG, BackupTool.RESTIC, BackupTool.RSYNC, BackupTool.RCLONE],
      description: "The best backup tool for the job."
    },
    schedule: {
      type: Type.STRING,
      description: "A valid cron expression."
    },
    retention: {
      type: Type.OBJECT,
      properties: {
        keepHourly: { type: Type.INTEGER },
        keepDaily: { type: Type.INTEGER },
        keepWeekly: { type: Type.INTEGER },
        keepMonthly: { type: Type.INTEGER },
        keepYearly: { type: Type.INTEGER }
      },
      required: ["keepHourly", "keepDaily", "keepWeekly", "keepMonthly", "keepYearly"]
    },
    jobName: {
        type: Type.STRING,
        description: "Descriptive name for the job."
    }
  },
  required: ["tool", "schedule", "retention", "jobName"]
};

export const generateBackupConfig = async (userPrompt: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Expert DevOps analysis of: "${userPrompt}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: backupConfigSchema,
        systemInstruction: "Suggest DevOps backup configuration including hourly retention if requested.",
      }
    });
    // FIX: Accessing .text as a property and trimming before parsing, ensuring fallback for undefined
    const text = response.text?.trim() || '{}';
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};