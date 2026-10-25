// The never-claim list (SKELETON section 1) as code, for text a model wrote: the CRO memo (ticket 14) and the notes the "why" answer repeats.
// A person is never called a fraudster or innocent, and a score or rank is never called a probability of fraud. Pure; a match means "do not show".
// A "probability of default" in a pricing sentence is fine, so the score rule applies only to a sentence that mentions fraud.
const PERSON = /\b(fraudsters?|innocents?|guilty|criminals?|proven|proof of fraud)\b/i;
const SCORE_WORD = "(?:score|scores|scored|rank|ranks|ranking|priority)";
const ODDS_WORD = "(?:probability|probabilities|probable|likelihood|chance|chances|odds)";
const SCORE_AS_ODDS = new RegExp(`\\b${SCORE_WORD}\\b[^.]{0,60}\\b${ODDS_WORD}\\b|\\b${ODDS_WORD}\\b[^.]{0,60}\\b${SCORE_WORD}\\b`, "i");

export const breaksWording = (text: string): boolean => PERSON.test(text) || (/fraud/i.test(text) && SCORE_AS_ODDS.test(text));
