import { theoryChapters, type TheoryChapter } from './theory';
import messages from './theory-vi.json';
import { translateText } from '../utils/localization';
import type { WelcomeLanguage } from '../utils/welcomePreferences';

const vietnamese: Readonly<Record<string, string>> = messages;

export function getTheoryChapters(language: WelcomeLanguage): TheoryChapter[] {
  if (language === 'en') return theoryChapters;
  const translate = (text: string) => Object.hasOwn(vietnamese, text) ? vietnamese[text] : translateText(text, language);
  return theoryChapters.map(chapter => ({
    ...chapter,
    coverTitle: translate(chapter.coverTitle),
    title: translate(chapter.title),
    subtitle: translate(chapter.subtitle),
    methods: chapter.methods.map(method => ({
      ...method,
      subtitle: translate(method.subtitle),
      idea: translate(method.idea),
      input: method.input.map(translate),
      output: method.output.map(translate),
      steps: method.steps.map(translate),
      parameters: method.parameters.map(([name, detail]) => [translate(name), translate(detail)]),
      reading: translate(method.reading),
      caution: translate(method.caution),
      lab: translate(method.lab),
      illustration: translate(method.illustration),
      reference: { ...method.reference, label: translate(method.reference.label) },
    })),
  }));
}
