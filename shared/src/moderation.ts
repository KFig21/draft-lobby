import {
  DataSet,
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
  type EnglishProfaneWord,
} from 'obscenity';

/**
 * Racial/ethnic slurs to block — deliberately narrow. Swear words, sexual
 * language, and non-ethnic slurs from obscenity's base English dataset are
 * excluded on purpose; only terms that target race/ethnicity are blocked.
 * Extend this list as needed (it's constrained to `EnglishProfaneWord` so a
 * typo is a type error, not a silent no-op).
 */
const SLUR_WORDS: EnglishProfaneWord[] = [
  'abeed',
  'abo',
  'africoon',
  'arabush',
  'boonga',
  'chingchong',
  'chink',
  'kike',
  'negro',
  'nigger',
];

const slurDataset = new DataSet<{ originalWord: EnglishProfaneWord }>()
  .addAll(englishDataset)
  .removePhrasesIf((phrase) => !SLUR_WORDS.includes(phrase.metadata!.originalWord));

const slurMatcher = new RegExpMatcher({
  ...slurDataset.build(),
  ...englishRecommendedTransformers,
});

/** Whether `text` contains a blocked racial/ethnic slur (leetspeak/spacing tricks included). */
export function containsSlur(text: string): boolean {
  return slurMatcher.hasMatch(text);
}
