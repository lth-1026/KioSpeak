// src/modules/llm/GeminiRealtimeClient.ts
import EventEmitter from 'eventemitter3';
import { GoogleGenAI, LiveServerMessage, Modality, Session } from '@google/genai';
import { CartManager, CartItem, CartOperationResult } from '../core/CartManager';
import { StoreProfileModule } from '../store_profile';
import { MockPaymentService, PaymentMethod } from '../payment';
import { decode, decodeAudioData } from './utils';
import { AgeGroup } from '../../shared/types';
import { buildSystemPrompt, toolDefinitions } from './prompts';

export type ConnectionMode = 'audio' | 'text';

export class GeminiRealtimeClient extends EventEmitter {
  private client: GoogleGenAI;
  private session: Session | null = null;
  private cartManager: CartManager;
  private storeProfile: StoreProfileModule;
  private paymentService: MockPaymentService;
  private outputAudioContext: AudioContext;
  private outputNode: GainNode;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private readonly API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  private isLLMUpdating = false;

  constructor(cartManager: CartManager, storeProfile: StoreProfileModule) {
    super();
    this.cartManager = cartManager;
    this.storeProfile = storeProfile;
    this.paymentService = new MockPaymentService({
      mode: 'alwaysSuccess',
      delayMs: 500, // 빠른 응답을 위해 딜레이 단축
    });

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

    // Listen to cart updates
    this.cartManager.on('cartUpdated', (summary) => {
      // Only notify if update is NOT from LLM and session is active
      if (!this.isLLMUpdating && this.session) {
        console.log("[Gemini] User manually updated cart. Notifying LLM.");
        this.stopAudio();
        this.sendTextMessage(`[System Notification] The user updated the cart via touch screen. Current Cart: ${JSON.stringify(summary)}`);
      }
    });
  }

  async connect(mode: ConnectionMode = 'audio', ageGroup?: AgeGroup) {
    const model = 'gemini-2.5-flash-native-audio-preview-12-2025';

    const tools = toolDefinitions;

    const systemInstruction = {
      parts: [{
        text: buildSystemPrompt(ageGroup)
      }]
    };

    // 프롬프트 확인용 콘솔 출력
    console.log('[System Instruction]', systemInstruction.parts[0].text);

    // 응답은 항상 오디오, outputAudioTranscription으로 텍스트 transcript도 받음
    const responseModalities = [Modality.AUDIO];

    try {
      this.emit('log', `Connecting to Gemini (${mode} mode)...`);
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            console.log("Gemini Connected");
            this.emit('log', `✅ Connected to Gemini (${mode} mode)`);
            this.emit('log', '⚙️ Initial setup sent');

            // Trigger initial greeting
            setTimeout(() => {
              this.sendTextMessage("손님이 왔어. 먼저 인사하고 주문을 받아줘.");
            }, 100);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData;
            if (audio && audio.data) {
              this.playAudioChunk(audio.data);
            }

            // Handle Text - 여러 위치에서 텍스트 찾기
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.text) {
                console.log("[Gemini Text]", part.text);
                this.emit('log', `🤖 Gemini: ${part.text}`);
                this.emit('text_response', part.text);
              }
            }

            // Handle output transcription (outputAudioTranscription 설정 시)
            const outputTranscription = (message as any).serverContent?.outputTranscription?.text;
            if (outputTranscription) {
              this.emit('log', `🤖 Gemini: ${outputTranscription}`);
              this.emit('text_response', outputTranscription);
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

            // Handle turnComplete
            const turnComplete = message.serverContent?.turnComplete;
            if (turnComplete) {
              this.emit('turn_complete');
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
          responseModalities: responseModalities,
          systemInstruction: systemInstruction,
          tools: tools,
          outputAudioTranscription: {}, // 오디오 응답의 텍스트 transcript 받기
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

    this.isLLMUpdating = true;

    try {
      for (const call of functionCalls) {
        const logMsg = `🛠️ Function Call: ${call.name}(${JSON.stringify(call.args)})`;
        console.log(`[Gemini Request] ${logMsg}`);
        this.emit('log', logMsg);

        let result: CartOperationResult | string | object;

        // 실제 Core 함수 실행
        if (call.name === "addToCart") {
          result = this.cartManager.addToCart(call.args.menuName, call.args.quantity || 1);
          const cartResult = result as CartOperationResult;

          // Handle initial options if provided
          if (cartResult.success && cartResult.cartItemId && call.args.initialOptionNames && Array.isArray(call.args.initialOptionNames)) {
            const cartItem = this.cartManager.getCartItem(cartResult.cartItemId);
            if (cartItem && cartItem.optionGroups) {
              for (const optName of call.args.initialOptionNames) {
                // Find matching option in any group
                for (const group of cartItem.optionGroups) {
                  const option = group.items.find(item => item.name === optName);
                  if (option) {
                    // Select it
                    console.log(`[Realtime] selecting initial option: ${optName}`);
                    this.cartManager.selectOption(cartResult.cartItemId!, group.id, option.id);
                    break; // Found and selected, move to next optName
                  }
                }
              }
              // Update pending options after processing initial selections
              const updatedPending = this.cartManager.getPendingRequiredOptions(cartResult.cartItemId);
              cartResult.pendingOptions = updatedPending.length > 0 ? updatedPending : undefined;
            }
          }
        } else if (call.name === "selectOption") {
          result = this.cartManager.selectOption(
            call.args.cartItemId,
            call.args.groupId,
            call.args.optionId
          );
        } else if (call.name === "updateQuantity") {
          result = this.cartManager.updateQuantity(call.args.cartItemId, call.args.quantity);
        } else if (call.name === "removeFromCart") {
          result = this.cartManager.removeCartItem(call.args.cartItemId);
        } else if (call.name === "getCart") {
          result = this.cartManager.getCartSummary();
        } else if (call.name === "openPaymentModal") {
          this.emit('payment_start'); // Opens the modal
          result = { success: true, message: "결제 모달을 열었습니다. 카드/모바일 선택을 유도하세요." };
        } else if (call.name === "changeCategory") {
          this.emit('change_category', call.args.categoryId);
          result = { success: true, message: `카테고리를 '${call.args.categoryId}'(으)로 변경했습니다.` };
        } else if (call.name === "getMenu") {
          result = this.storeProfile.getMenuForLLM();
        } else if (call.name === "processPayment") {
          const cart = this.cartManager.getCart();
          if (cart.length === 0) {
            result = { success: false, message: "장바구니가 비어있습니다. 먼저 메뉴를 추가해주세요." };
          } else {

            const paymentResult = await this.paymentService.requestPayment({
              orderId: this.generateOrderId(),
              orderName: this.generateOrderName(cart),
              amount: this.cartManager.getTotal(),
              method: call.args.method as PaymentMethod,
            });

            if (paymentResult.success) {
              this.cartManager.clearCart();
              result = { success: true, message: `결제가 완료되었습니다.` };
              this.emit('payment', { success: true, transactionId: paymentResult.transactionId });
            } else {
              result = { success: false, message: `결제에 실패했습니다. 사유: ${paymentResult.failureReason}` };
              this.emit('payment', { success: false, reason: paymentResult.failureReason });
            }
          }
        } else {
          result = { success: false, message: `알 수 없는 함수: ${call.name}` };
        }

        // Tool Call 이벤트 emit (UI에서 사용)
        this.emit('tool_call', {
          name: call.name,
          args: call.args,
          result: result,
        });

        // 결과 패키징
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: { result: result } // 함수의 리턴값을 Gemini에게 전달
        });
      }
    } catch (e) {
      console.error("Error processing tool calls:", e);
      this.emit('log', `❌ Tool Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.isLLMUpdating = false;
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

  stopAudio() {
    for (const source of this.sources.values()) {
      source.stop();
      this.sources.delete(source);
    }
    this.nextStartTime = 0;
  }

  private generateOrderId(): string {
    return `order_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateOrderName(cart: CartItem[]): string {
    if (cart.length === 0) return '';
    if (cart.length === 1) return cart[0].menuName;
    return `${cart[0].menuName} 외 ${cart.length - 1}건`;
  }

  // Public method to send text message (텍스트 모드용)
  sendTextMessage(text: string): void {
    if (this.session) {
      try {
        this.emit('log', `👤 User: ${text}`);
        this.emit('user_message', text); // 사용자 메시지 이벤트

        // role/parts 형식으로 전송
        this.session.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{ text: text }]
            }
          ],
          turnComplete: true,
        });
      } catch (error) {
        console.error("Failed to send text message:", error);
        this.emit('log', `❌ Failed to send: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      this.emit('log', '❌ Session not connected');
    }
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