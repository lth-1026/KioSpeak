
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiRealtimeClient } from './Realtime';
import { AgeGroup } from '../../shared/types';
import { CartManager } from '../core/CartManager';
import { StoreProfileModule } from '../store_profile';

// Hoist mocks to ensure they are available for vi.mock
const { MockCartManager, MockStoreProfileModule, MockGoogleGenAI } = vi.hoisted(() => {
  class MockCartManager {
    addToCart = vi.fn();
    addOptionToItem = vi.fn();
    getCart = vi.fn().mockReturnValue([]);
    getTotal = vi.fn().mockReturnValue(0);
    clearCart = vi.fn();
  }

  class MockStoreProfileModule {
    getMenuForLLM = vi.fn().mockReturnValue({});
  }

  class MockGoogleGenAI {
    live = {
      connect: vi.fn().mockResolvedValue({
        sendToolResponse: vi.fn(),
        sendClientContent: vi.fn(),
        sendRealtimeInput: vi.fn(),
        close: vi.fn(),
      }),
    };
  }

  return { MockCartManager, MockStoreProfileModule, MockGoogleGenAI };
});

// Mock dependencies
vi.mock('@google/genai', () => ({
  GoogleGenAI: MockGoogleGenAI,
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
  },
  Modality: {
    AUDIO: 'AUDIO',
  },
}));

vi.mock('../core/CartManager', () => ({
  CartManager: MockCartManager,
}));

vi.mock('../store_profile', () => ({
  StoreProfileModule: MockStoreProfileModule,
}));

// Mock AudioContext
class MockAudioContext {
  createGain = vi.fn().mockReturnValue({
    connect: vi.fn(),
  });
  createBufferSource = vi.fn().mockReturnValue({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    addEventListener: vi.fn(),
  });
  decodeAudioData = vi.fn().mockResolvedValue({
    duration: 1,
  });
  currentTime = 0;
  destination = {};
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('window', {
  AudioContext: MockAudioContext,
  webkitAudioContext: MockAudioContext,
  location: { origin: 'http://localhost' },
});

describe('GeminiRealtimeClient', () => {
  let client: GeminiRealtimeClient;
  let mockCartManager: CartManager;
  let mockStoreProfile: StoreProfileModule;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create instances of the mocks
    mockCartManager = new MockCartManager() as unknown as CartManager;
    mockStoreProfile = new MockStoreProfileModule() as unknown as StoreProfileModule;

    // Mock environment variable
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-api-key');

    client = new GeminiRealtimeClient(mockCartManager, mockStoreProfile);
  });

  it('should include speed instruction for CHILD age group', async () => {
    await client.connect('audio', AgeGroup.CHILD);

    // Access the mocked GoogleGenAI instance
    // Since client.client is private, we cast to any
    const googleGenAIInstance = (client as any).client;
    const connectCall = googleGenAIInstance.live.connect.mock.calls[0][0];
    const systemInstructionText = connectCall.config.systemInstruction.parts[0].text;

    expect(systemInstructionText).toContain('사용자가 어린이, 중장년층 또는 고령자입니다');
    expect(systemInstructionText).toContain('목소리 속도를 평소보다 천천히 하고');
  });

  it('should include speed instruction for SENIOR age group', async () => {
    await client.connect('audio', AgeGroup.SENIOR);

    const googleGenAIInstance = (client as any).client;
    const connectCall = googleGenAIInstance.live.connect.mock.calls[0][0];
    const systemInstructionText = connectCall.config.systemInstruction.parts[0].text;

    expect(systemInstructionText).toContain('사용자가 어린이, 중장년층 또는 고령자입니다');
  });

  it('should include speed instruction for MIDDLE_AGED age group', async () => {
    await client.connect('audio', AgeGroup.MIDDLE_AGED);

    const googleGenAIInstance = (client as any).client;
    const connectCall = googleGenAIInstance.live.connect.mock.calls[0][0];
    const systemInstructionText = connectCall.config.systemInstruction.parts[0].text;

    expect(systemInstructionText).toContain('사용자가 어린이, 중장년층 또는 고령자입니다');
  });

  it('should NOT include speed instruction for ADULT age group', async () => {
    await client.connect('audio', AgeGroup.ADULT);

    const googleGenAIInstance = (client as any).client;
    const connectCall = googleGenAIInstance.live.connect.mock.calls[0][0];
    const systemInstructionText = connectCall.config.systemInstruction.parts[0].text;

    expect(systemInstructionText).not.toContain('사용자가 어린이, 중장년층 또는 고령자입니다');
  });

  it('should NOT include speed instruction for TEENAGER age group', async () => {
    await client.connect('audio', AgeGroup.TEENAGER);

    const googleGenAIInstance = (client as any).client;
    const connectCall = googleGenAIInstance.live.connect.mock.calls[0][0];
    const systemInstructionText = connectCall.config.systemInstruction.parts[0].text;

    expect(systemInstructionText).not.toContain('사용자가 어린이, 중장년층 또는 고령자입니다');
  });

  it('should NOT include speed instruction when age group is undefined', async () => {
    await client.connect('audio');

    const googleGenAIInstance = (client as any).client;
    const connectCall = googleGenAIInstance.live.connect.mock.calls[0][0];
    const systemInstructionText = connectCall.config.systemInstruction.parts[0].text;

    expect(systemInstructionText).not.toContain('사용자가 어린이, 중장년층 또는 고령자입니다');
  });
});
