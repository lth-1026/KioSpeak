import systemPromptTemplate from './system.md?raw';
import speedInstructionText from './speedInstruction.md?raw';
import { AgeGroup } from '../../../shared/types';

export function buildSystemPrompt(ageGroup?: AgeGroup): string {
  const needsSlowSpeech = ageGroup === AgeGroup.CHILD ||
                          ageGroup === AgeGroup.MIDDLE_AGED ||
                          ageGroup === AgeGroup.SENIOR;

  const speedInstruction = needsSlowSpeech ? speedInstructionText : '';
  return systemPromptTemplate.replace('{{speedInstruction}}', speedInstruction);
}

export { toolDefinitions } from './toolDefinitions';
