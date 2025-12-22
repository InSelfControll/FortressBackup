
import { GoogleGenAI, Type } from "@google/genai";
import { BackupTool, AIProvider, AIConfig } from '../types.ts';

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

const SYSTEM_PROMPT = `Suggest a backup configuration in JSON format.
Ensure fields: tool (BorgBackup, Restic, Rsync, Rclone), schedule (cron), jobName (string), and retention (object with keepHourly, keepDaily, keepWeekly, keepMonthly, keepYearly as integers).`;

export const generateBackupConfig = async (userPrompt: string, config: AIConfig) => {
  if (config.provider === AIProvider.NONE) {
    throw new Error("AI is not configured.");
  }

  // Fix: Strictly following Gemini SDK guidelines for initialization and API key retrieval.
  if (config.provider === AIProvider.GEMINI) {
    // Guidelines: Use new GoogleGenAI({ apiKey: process.env.API_KEY }) exclusively.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      // Guidelines: Use ai.models.generateContent for querying models.
      const response = await ai.models.generateContent({
        model: config.model || 'gemini-3-flash-preview',
        contents: `Expert DevOps analysis of: "${userPrompt}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: backupConfigSchema,
          systemInstruction: SYSTEM_PROMPT,
        }
      });
      // Fix: Access .text property (not a method) from GenerateContentResponse as per guidelines.
      const text = response.text?.trim() || '{}';
      return JSON.parse(text);
    } catch (error) {
      console.error("Gemini AI Error:", error);
      throw error;
    }
  }

  if (config.provider === AIProvider.OPENAI) {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const model = config.model || 'gpt-4o';
    
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT + " Output raw JSON only." },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return JSON.parse(data.choices[0].message.content);
    } catch (error) {
      console.error("OpenAI AI Error:", error);
      throw error;
    }
  }

  throw new Error("Unsupported AI provider");
};
