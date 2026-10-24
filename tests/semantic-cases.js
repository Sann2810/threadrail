// Synthetic, fixed passages from the explicitly created compatibility chat,
// plus independent events and plausible distractors.
export const eventSentence = 'Zen accidentally poured juice into the kettle while San packed a blue suitcase for the ferry.';
export const eventPrompt = `ThreadRail compatibility test. Reply with one sentence: ${eventSentence} Do not inspect or modify files, run tools, or create commits.`;
export const radiatorSentence = 'Rey repaired the broken radiator before the snowstorm.';
export const semanticMessages = [
  {prompt:eventPrompt,answer:`<p id="mixed-event">${eventSentence}</p>`},
  {prompt:'Second text-only ThreadRail compatibility sample. Write exactly 40 numbered short lines. Line 20 must say: Rey repaired the broken radiator before the snowstorm. All other lines should describe ordinary office tasks without mentioning Zen, San, Rey, kettles, juice, suitcases, ferries, radiators, or snowstorms. Do not use tools or modify files.',answer:`<ol>${Array.from({length:40},(_,i)=>`<li${i===19?' id="radiator-event"':''}>${i===19?radiatorSentence:`Review office document ${i+1}.`}</li>`).join('')}</ol>`},
  {prompt:'Describe mindfulness.',answer:'<p>Zen meditation involves focused attention and breathing.</p>'},
  {prompt:'Describe another breakfast.',answer:'<p>Leila put salt in her coffee.</p>'},
  {prompt:'Where was the bag left?',answer:'<p>The suitcase was left in the hallway.</p>'},
  {prompt:'Give the transit update.',answer:'<p>The ferry timetable was published online.</p>'},
  {prompt:'Continue the travel chapter.',answer:'<p id="passport-event">Kai obtained a replacement passport before flying to Lisbon.</p>'},
  {prompt:'Describe the audio edit.',answer:'<p id="audio-event">The editor removed microphone hiss from the interview recording.</p>'},
];
export const semanticCases = [
  {query:'someone made a foolish kitchen mistake',expected:'Zen accidentally poured juice into the kettle',target:'#mixed-event'},
  {query:'packing luggage for a boat journey',expected:'San packed a blue suitcase for the ferry.',target:'#mixed-event'},
  {query:'Zen made a foolish mistake',expected:'Zen accidentally poured juice into the kettle',target:'#mixed-event'},
  {query:'fixing the heating before bad winter weather',expected:radiatorSentence,target:'#radiator-event'},
  {query:'getting luggage ready to travel over water',expected:'San packed a blue suitcase for the ferry.',target:'#mixed-event'},
  {query:'repairing a heater ahead of a blizzard',expected:radiatorSentence,target:'#radiator-event'},
  {query:'replacing lost documents before an overseas flight',expected:'Kai obtained a replacement passport before flying to Lisbon.',target:'#passport-event'},
  {query:'reducing background noise from a recording',expected:'The editor removed microphone hiss from the interview recording.',target:'#audio-event'},
];
