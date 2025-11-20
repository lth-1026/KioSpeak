// src/modules/llm/GeminiRealtimeClient.ts
import EventEmitter from 'eventemitter3';
import { GoogleGenAI, LiveServerMessage, Modality, Session, Tool, Type } from '@google/genai';
import { CartManager } from '../core/CartManager';
import menuData from '../store_profile/menu.json';
import { decode, decodeAudioData } from './utils';

export class GeminiRealtimeClient extends EventEmitter {
  private client: GoogleGenAI;
  private session: Session | null = null;
  private cartManager: CartManager;
  private outputAudioContext: AudioContext;
  private outputNode: GainNode;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private readonly API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  constructor(cartManager: CartManager) {
    super();
    this.cartManager = cartManager;

    if (!this.API_KEY) {
      console.error("API Key is missing. Please set VITE_GEMINI_API_KEY in .env");
      throw new Error("API Key is missing");
    }

    this.client = new GoogleGenAI({
      apiKey: this.API_KEY,
    });

    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.outputNode = this.outputAudioContext.createGain();
    this.outputNode.connect(this.outputAudioContext.destination);
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  async connect() {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025'; // User requested model

    const tools: Tool[] = [
      {
        functionDeclarations: [
          {
            name: "addToCart",
            description: "장바구니에 메뉴를 추가합니다.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                menuName: { type: Type.STRING, description: "추가할 구체적인 메뉴 이름 (예: 불고기 버거)" },
                quantity: { type: Type.NUMBER, description: "수량" }
              },
              required: ["menuName"]
            }
          },
          {
            name: "addOptionToItem",
            description: "주문한 메뉴에 옵션(세트/단품, 음료 등)을 추가합니다.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                menuName: { type: Type.STRING, description: "옵션을 추가할 메뉴 이름" },
                optionName: { type: Type.STRING, description: "추가할 옵션 내용 (예: 세트, 콜라)" }
              },
              required: ["menuName", "optionName"]
            }
          }
        ]
      }
    ];

    const systemInstruction = {
      parts: [{
        text: `
          당신은 햄버거 가게의 친절한 키오스크 직원입니다.
          
          [메뉴 정보]
          ${JSON.stringify(menuData)}

          [대화 규칙]
          1. 사용자가 모호하게 주문하면(예: "햄버거 줘"), 메뉴에 있는 구체적인 종류를 나열하며 되물어보세요(예: "불고기 버거와 한우 버거가 있습니다. 어떤 걸 드릴까요?").
          2. 메뉴가 확정되면 함수 'addToCart'를 호출하세요.
          3. 햄버거 주문 시 반드시 '세트'인지 '단품'인지 물어보세요.
          4. '세트' 선택 시, 음료(콜라 / 사이다)를 물어보세요.
          5. 옵션이 결정되면 함수 'addOptionToItem'을 호출하세요.
          6. 한국어로 자연스럽게 대화하세요.
        `
      }]
    };

    try {
      this.emit('log', 'Connecting to Gemini...');
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            console.log("Gemini Connected");
            this.emit('log', '✅ Connected to Gemini (Text + Audio)');
            // Initial setup (system instruction and tools) are now part of the connect config
            this.emit('log', '⚙️ Initial setup sent');
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData;
            if (audio && audio.data) {
              this.playAudioChunk(audio.data);
            }

            // Handle Text (if available)
            const text = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (text) {
              console.log("[Gemini Text]", text);
              this.emit('log', `🤖 Gemini: ${text}`);
            }

            // Handle Function Calls
            const toolCall = message.toolCall;
            if (toolCall) {
              await this.handleToolCall(toolCall);
            }

            // Handle Interruption
            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              this.stopAudio();
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error("Gemini Error:", e);
            this.emit('log', `❌ Error: ${e.message}`);
          },
          onclose: (e: CloseEvent) => {
            console.log("Gemini Disconnected", e);
            this.emit('log', `🔌 Disconnected: ${e.code} ${e.reason}`);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO], // Both TEXT and AUDIO needed for tool calls
          systemInstruction: systemInstruction,
          tools: tools,
          // speechConfig: {
          //   voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } },
          // },
        },
      });
    } catch (e) {
      console.error("Connection Failed:", e);
      this.emit('log', `❌ Connection Failed: ${e instanceof Error ? e.message : String(e)} `);
    }
  }

  // Helper to handle tool calls
  private async handleToolCall(toolCall: any) {
    const functionCalls = toolCall.functionCalls;
    const functionResponses = [];

    for (const call of functionCalls) {
      const logMsg = `🛠️ Function Call: ${call.name}(${JSON.stringify(call.args)})`;
      console.log(`[Gemini Request] ${logMsg}`);
      this.emit('log', logMsg);

      let result;
      // 실제 Core 함수 실행
      if (call.name === "addToCart") {
        result = this.cartManager.addToCart(call.args.menuName, call.args.quantity);
      } else if (call.name === "addOptionToItem") {
        result = this.cartManager.addOptionToItem(call.args.menuName, call.args.optionName);
      }

      // 결과 패키징
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: result } // 함수의 리턴값을 Gemini에게 전달
      });
    }

    // Send tool response
    if (this.session) {
      console.log("[Client] Sending Tool Response:", functionResponses);
      this.session.sendToolResponse({
        functionResponses: functionResponses
      });
    }
  }

  // Helper to play audio
  private async playAudioChunk(base64Data: string) {
    this.nextStartTime = Math.max(
      this.nextStartTime,
      this.outputAudioContext.currentTime,
    );

    const audioBuffer = await decodeAudioData(
      decode(base64Data),
      this.outputAudioContext,
      24000,
      1,
    );
    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputNode);
    source.addEventListener('ended', () => {
      this.sources.delete(source);
    });

    source.start(this.nextStartTime);
    this.nextStartTime = this.nextStartTime + audioBuffer.duration;
    this.sources.add(source);
  }

  private stopAudio() {
    for (const source of this.sources.values()) {
      source.stop();
      this.sources.delete(source);
    }
    this.nextStartTime = 0;
  }

  // Public method to send audio from microphone
  sendAudioChunk(base64Audio: string) {
    if (this.session) {
      try {
        this.session.sendRealtimeInput({
          media: {
            mimeType: "audio/pcm;rate=16000", // Assuming 16kHz PCM from microphone
            data: base64Audio
          }
        });
      } catch (error) {
        // Ignore errors if socket is closed, just log debug
        console.debug("Failed to send audio chunk:", error);
      }
    }
  }

  // Public method to disconnect from Gemini
  disconnect() {
    if (this.session) {
      this.emit('log', '🔌 Disconnecting from Gemini...');
      this.session.close();
      this.session = null;
      this.stopAudio();
      this.emit('log', '✅ Disconnected successfully');
    }
  }
}