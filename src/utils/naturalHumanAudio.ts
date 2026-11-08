export interface HumanVoiceSample {
  id: string;
  name: string;
  speaker: string;
  gender: 'Female' | 'Male';
  accent: 'US' | 'UK' | 'CA' | 'IN' | 'EU' | 'Global';
  transcript: string;
  url: string;
  attribution: string;
  license: string;
  duration: number; // approximate seconds
  category: 'CMU ARCTIC (Speech Science)' | 'Open Speech Repository (Harvard Sentences)';
}

export const ATTRIBUTION_DETAILS = {
  project: 'CMU ARCTIC & Open Speech Repositories',
  institution: 'Carnegie Mellon University & Open Speech Repository',
  authors: 'John Kominek, Alan W. Black (CMU), Telchemy OSR',
  license: 'Free Open Data / BSD Permissive License (Attribution Only)',
  description:
    'Real human studio voice recordings of phonetically balanced sentences spoken by distinct professional speakers with diverse natural accents.',
  ruleCompliance: '100% Non-AI. Recorded by real human speakers in acoustic recording chambers.',
};

export const NATURAL_HUMAN_SAMPLES: HumanVoiceSample[] = [
  // 1. SLT - US Female (Silicon Valley / California)
  {
    id: 'cmu-slt-1',
    name: 'Aria / SLT (US Female - California)',
    speaker: 'Real Human Female (US California)',
    gender: 'Female',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_slt_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker SLT)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.3,
    category: 'CMU ARCTIC (Speech Science)',
  },
  {
    id: 'cmu-slt-2',
    name: 'Aria / SLT (US Female - Sentence 2)',
    speaker: 'Real Human Female (US California)',
    gender: 'Female',
    accent: 'US',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_slt_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker SLT)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.3,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 2. RMS - US Male (Deep Resonant Baritone)
  {
    id: 'cmu-rms-1',
    name: 'Marcus / RMS (Deep American Baritone)',
    speaker: 'Real Human Male (Deep Baritone, Robert M. Smith)',
    gender: 'Male',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_rms_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker RMS)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.0,
    category: 'CMU ARCTIC (Speech Science)',
  },
  {
    id: 'cmu-rms-2',
    name: 'Marcus / RMS (Deep American Baritone - Sentence 2)',
    speaker: 'Real Human Male (Deep Baritone, Robert M. Smith)',
    gender: 'Male',
    accent: 'US',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_rms_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker RMS)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.2,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 3. AWB - Scottish Male (Alan W Black)
  {
    id: 'cmu-awb-1',
    name: 'Oliver / AWB (Scottish English Male)',
    speaker: 'Real Human Male (Alan W. Black, Edinburgh Scotland)',
    gender: 'Male',
    accent: 'UK',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_awb_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker AWB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.9,
    category: 'CMU ARCTIC (Speech Science)',
  },
  {
    id: 'cmu-awb-2',
    name: 'Oliver / AWB (Scottish English Male - Sentence 2)',
    speaker: 'Real Human Male (Alan W. Black, Edinburgh Scotland)',
    gender: 'Male',
    accent: 'UK',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_awb_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker AWB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 4.8,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 4. CLB - US Female (Boston Massachusetts)
  {
    id: 'cmu-clb-1',
    name: 'Charlotte / CLB (US Female - Boston)',
    speaker: 'Real Human Female (US Boston, Massachusetts)',
    gender: 'Female',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_clb_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker CLB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.6,
    category: 'CMU ARCTIC (Speech Science)',
  },
  {
    id: 'cmu-clb-2',
    name: 'Charlotte / CLB (US Female - Sentence 2)',
    speaker: 'Real Human Female (US Boston, Massachusetts)',
    gender: 'Female',
    accent: 'US',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_clb_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker CLB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.6,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 5. BDL - US Male (Boston Massachusetts)
  {
    id: 'cmu-bdl-1',
    name: 'David / BDL (US Male - Boston)',
    speaker: 'Real Human Male (US Boston, Massachusetts)',
    gender: 'Male',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_bdl_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker BDL)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.2,
    category: 'CMU ARCTIC (Speech Science)',
  },
  {
    id: 'cmu-bdl-2',
    name: 'David / BDL (US Male - Sentence 2)',
    speaker: 'Real Human Male (US Boston, Massachusetts)',
    gender: 'Male',
    accent: 'US',
    transcript: 'For the twentieth time that evening the two men shook hands.',
    url: '/samples/cmu_bdl_arctic_a0003.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker BDL)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.3,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 6. JMK - Canadian Male (John M Kominek)
  {
    id: 'cmu-jmk-1',
    name: 'John / JMK (Canadian English Male)',
    speaker: 'Real Human Male (John M. Kominek, Canada)',
    gender: 'Male',
    accent: 'CA',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_jmk_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker JMK)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.8,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 7. KSP - Indian English Male
  {
    id: 'cmu-ksp-1',
    name: 'Dev / KSP (Indian English Male)',
    speaker: 'Real Human Male (Indian English Cadence)',
    gender: 'Male',
    accent: 'IN',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_ksp_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker KSP)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.2,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 8. OSR Harvard Sentences - Female
  {
    id: 'osr-harvard-female',
    name: 'Elena / OSR (Harvard Sentences Female)',
    speaker: 'Real Human Female (Open Speech Repository Studio)',
    gender: 'Female',
    accent: 'US',
    transcript: 'The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.',
    url: '/samples/osr_harvard_female.wav',
    attribution: 'Open Speech Repository (OSR IEEE Harvard Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 33.6,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 9. OSR Harvard Sentences - Male
  {
    id: 'osr-harvard-male',
    name: 'Michael / OSR (Harvard Sentences Male)',
    speaker: 'Real Human Male (Open Speech Repository Studio)',
    gender: 'Male',
    accent: 'US',
    transcript: 'The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.',
    url: '/samples/osr_harvard_male.wav',
    attribution: 'Open Speech Repository (OSR IEEE Harvard Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 46.9,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 10. OSR British English Male 1
  {
    id: 'osr-british-male-1',
    name: 'Alistair / OSR (British RP Male)',
    speaker: 'Real Human Male (British English Studio Recording)',
    gender: 'Male',
    accent: 'UK',
    transcript: 'The birch canoe slid on the smooth planks. Four hours of steady work faced us.',
    url: '/samples/osr_british_male_1.wav',
    attribution: 'Open Speech Repository (OSR British English Corpus)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 39.8,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 11. OSR British English Male 2
  {
    id: 'osr-british-male-2',
    name: 'Rupert / OSR (Distinguished UK Male)',
    speaker: 'Real Human Male (British English Studio Recording)',
    gender: 'Male',
    accent: 'UK',
    transcript: 'These days a chicken leg is a rare dish. Four hours of steady work faced us.',
    url: '/samples/osr_british_male_2.wav',
    attribution: 'Open Speech Repository (OSR British English Corpus)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 43.4,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 12. OSR Harvard Sentences Female List 2
  {
    id: 'osr-harvard-female-2',
    name: 'Victoria / OSR (American Harvard Narrator II)',
    speaker: 'Real Human Female (Open Speech Repository Studio)',
    gender: 'Female',
    accent: 'US',
    transcript: 'A king ruled the state in the early days. The ship was torn on the sharp reef.',
    url: '/samples/osr_harvard_female_2.wav',
    attribution: 'Open Speech Repository (OSR IEEE Harvard Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 32.7,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 13. SLT - Sentence 4 (Dialogue greeting)
  {
    id: 'cmu-slt-4',
    name: 'Willow / SLT (California Female - Dialogue)',
    speaker: 'Real Human Female (US California)',
    gender: 'Female',
    accent: 'US',
    transcript: "Lord, but I'm glad to see you again, Phil.",
    url: '/samples/cmu_slt_arctic_a0004.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker SLT)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 2.5,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 14. RMS - Sentence 4 (Deep baritone greeting)
  {
    id: 'cmu-rms-4',
    name: 'Garrison / RMS (Deep Baritone - Dialogue)',
    speaker: 'Real Human Male (Robert M. Smith, Deep Baritone)',
    gender: 'Male',
    accent: 'US',
    transcript: "Lord, but I'm glad to see you again, Phil.",
    url: '/samples/cmu_rms_arctic_a0004.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker RMS)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 2.2,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 15. AWB - Sentence 4 (Scottish greeting)
  {
    id: 'cmu-awb-4',
    name: 'Hamish / AWB (Scottish Male - Dialogue)',
    speaker: 'Real Human Male (Alan W. Black, Edinburgh Scotland)',
    gender: 'Male',
    accent: 'UK',
    transcript: "Lord, but I'm glad to see you again, Phil.",
    url: '/samples/cmu_awb_arctic_a0004.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker AWB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.9,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 16. CLB - Sentence 4 (Boston female greeting)
  {
    id: 'cmu-clb-4',
    name: 'Beatrice / CLB (Boston Female - Dialogue)',
    speaker: 'Real Human Female (US Boston, Massachusetts)',
    gender: 'Female',
    accent: 'US',
    transcript: "Lord, but I'm glad to see you again, Phil.",
    url: '/samples/cmu_clb_arctic_a0004.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker CLB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 2.9,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 17. BDL - Sentence 4 (Boston male greeting)
  {
    id: 'cmu-bdl-4',
    name: 'Sterling / BDL (Mid-Atlantic Male - Dialogue)',
    speaker: 'Real Human Male (US Boston, Massachusetts)',
    gender: 'Male',
    accent: 'US',
    transcript: "Lord, but I'm glad to see you again, Phil.",
    url: '/samples/cmu_bdl_arctic_a0004.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker BDL)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 2.5,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 18. JMK - Sentence 4 (Canadian greeting)
  {
    id: 'cmu-jmk-4',
    name: 'Liam / JMK (Canadian Male - Dialogue)',
    speaker: 'Real Human Male (John M. Kominek, Canada)',
    gender: 'Male',
    accent: 'CA',
    transcript: "Lord, but I'm glad to see you again, Phil.",
    url: '/samples/cmu_jmk_arctic_a0004.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker JMK)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.2,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 19. KSP - Sentence 4 (Indian English greeting)
  {
    id: 'cmu-ksp-4',
    name: 'Rajesh / KSP (Indian English - Dialogue)',
    speaker: 'Real Human Male (Indian English Cadence)',
    gender: 'Male',
    accent: 'IN',
    transcript: "Lord, but I'm glad to see you again, Phil.",
    url: '/samples/cmu_ksp_arctic_a0004.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker KSP)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 2.8,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 20. FEM - American Clear Mezzo Female
  {
    id: 'cmu-fem-1',
    name: 'Fiona / FEM (American Clear Mezzo)',
    speaker: 'Real Human Female (CMU ARCTIC FEM, Studio Acoustic)',
    gender: 'Female',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_fem_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker FEM)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.5,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 21. AEW - US Midwestern Radio Host
  {
    id: 'cmu-aew-1',
    name: 'Alexander / AEW (US Midwestern Male)',
    speaker: 'Real Human Male (CMU ARCTIC AEW, Studio Acoustic)',
    gender: 'Male',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_aew_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker AEW)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.8,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 22. AHW - Continental European / German English Male
  {
    id: 'cmu-ahw-1',
    name: 'Hans / AHW (European Academic Presenter)',
    speaker: 'Real Human Male (CMU ARCTIC AHW, German Accent)',
    gender: 'Male',
    accent: 'EU',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_ahw_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker AHW)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.4,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 23. AUP - Indian English Male
  {
    id: 'cmu-aup-1',
    name: 'Arjun / AUP (Indian English Tech Leader)',
    speaker: 'Real Human Male (CMU ARCTIC AUP, Indian English)',
    gender: 'Male',
    accent: 'IN',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_aup_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker AUP)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 2.9,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 24. AXB - Indian English Female
  {
    id: 'cmu-axb-1',
    name: 'Ananya / AXB (Indian English Studio Host)',
    speaker: 'Real Human Female (CMU ARCTIC AXB, Indian English)',
    gender: 'Female',
    accent: 'IN',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_axb_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker AXB)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.4,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 25. EEY - Conversational Audio Narrator
  {
    id: 'cmu-eey-1',
    name: 'Ethan / EEY (Conversational Narrator)',
    speaker: 'Real Human Male (CMU ARCTIC EEY, Studio Acoustic)',
    gender: 'Male',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_eey_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker EEY)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.0,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 26. GKA - International Conference Speaker
  {
    id: 'cmu-gka-1',
    name: 'Gaurav / GKA (International Conference Speaker)',
    speaker: 'Real Human Male (CMU ARCTIC GKA, Indian English)',
    gender: 'Male',
    accent: 'IN',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_gka_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker GKA)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.1,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 27. LJM - US Broadcast Journalist
  {
    id: 'cmu-ljm-1',
    name: 'Lauren / LJM (US Broadcast Journalist)',
    speaker: 'Real Human Female (CMU ARCTIC LJM, Studio Acoustic)',
    gender: 'Female',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_ljm_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker LJM)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.0,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 28. LNH - US Narrative Storyteller
  {
    id: 'cmu-lnh-1',
    name: 'Nora / LNH (US Narrative Storyteller)',
    speaker: 'Real Human Female (CMU ARCTIC LNH, Studio Acoustic)',
    gender: 'Female',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_lnh_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker LNH)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 4.5,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 29. SLP - Warm Indian English Lecturer
  {
    id: 'cmu-slp-1',
    name: 'Priya / SLP (Warm Indian English Lecturer)',
    speaker: 'Real Human Female (CMU ARCTIC SLP, Indian English)',
    gender: 'Female',
    accent: 'IN',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_slp_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker SLP)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.3,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 30. RXR - Expressive Cinematic Reader
  {
    id: 'cmu-rxr-1',
    name: 'Rowan / RXR (Expressive Cinematic Reader)',
    speaker: 'Real Human Male (CMU ARCTIC RXR, Studio Acoustic)',
    gender: 'Male',
    accent: 'US',
    transcript: 'Author of the danger trail, Philip Steels, etc.',
    url: '/samples/cmu_rxr_arctic_a0001.wav',
    attribution: 'Carnegie Mellon University (CMU ARCTIC Corpus - Speaker RXR)',
    license: 'Free Open License (BSD-style attribution)',
    duration: 3.7,
    category: 'CMU ARCTIC (Speech Science)',
  },

  // 31. OSR UK Male 3 - Arthur
  {
    id: 'osr-uk-male-3',
    name: 'Arthur / OSR (Royal Society British RP)',
    speaker: 'Real Human Male (Open Speech Repository UK)',
    gender: 'Male',
    accent: 'UK',
    transcript: 'The birch canoe slid on the smooth planks. Four hours of steady work faced us.',
    url: '/samples/osr_uk_male_3.wav',
    attribution: 'Open Speech Repository (OSR British English Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 38.4,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 32. OSR UK Male 4 - Oliver
  {
    id: 'osr-uk-male-4',
    name: 'Oliver / OSR (London Audio Producer)',
    speaker: 'Real Human Male (Open Speech Repository UK)',
    gender: 'Male',
    accent: 'UK',
    transcript: 'These days a chicken leg is a rare dish. The play seems dull and quite stupid.',
    url: '/samples/osr_uk_male_4.wav',
    attribution: 'Open Speech Repository (OSR British English Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 39.0,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 33. OSR UK Female 1 - Gwendolyn
  {
    id: 'osr-uk-female-1',
    name: 'Gwendolyn / OSR (Oxford Scholarly Reader)',
    speaker: 'Real Human Female (Open Speech Repository UK)',
    gender: 'Female',
    accent: 'UK',
    transcript: 'The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.',
    url: '/samples/osr_uk_female_1.wav',
    attribution: 'Open Speech Repository (OSR British English Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 43.4,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 34. OSR UK Female 2 - Penelope
  {
    id: 'osr-uk-female-2',
    name: 'Penelope / OSR (London Theatre Artist)',
    speaker: 'Real Human Female (Open Speech Repository UK)',
    gender: 'Female',
    accent: 'UK',
    transcript: 'These days a chicken leg is a rare dish. The beam balanced easily on each pin.',
    url: '/samples/osr_uk_female_2.wav',
    attribution: 'Open Speech Repository (OSR British English Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 52.4,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 35. OSR US Female 3 - Seraphina
  {
    id: 'osr-us-female-3',
    name: 'Seraphina / OSR (American Public Radio Lead)',
    speaker: 'Real Human Female (Open Speech Repository US)',
    gender: 'Female',
    accent: 'US',
    transcript: 'The soft cushion was light and friendly. The salt breeze came across from the sea.',
    url: '/samples/osr_us_female_3.wav',
    attribution: 'Open Speech Repository (OSR IEEE Harvard Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 33.2,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 36. OSR US Female 4 - Madeline
  {
    id: 'osr-us-female-4',
    name: 'Madeline / OSR (American Classical Reader)',
    speaker: 'Real Human Female (Open Speech Repository US)',
    gender: 'Female',
    accent: 'US',
    transcript: 'A king ruled the state in the early days. The ship was torn on the sharp reef.',
    url: '/samples/osr_us_female_4.wav',
    attribution: 'Open Speech Repository (OSR IEEE Harvard Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 32.5,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 37. OSR US Male 3 - Harrison
  {
    id: 'osr-us-male-3',
    name: 'Harrison / OSR (US Documentary Voice)',
    speaker: 'Real Human Male (Open Speech Repository US)',
    gender: 'Male',
    accent: 'US',
    transcript: 'The birch canoe slid on the smooth planks. Four hours of steady work faced us.',
    url: '/samples/osr_us_male_3.wav',
    attribution: 'Open Speech Repository (OSR IEEE Harvard Sentences)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 52.4,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 38. OSR India Speaker 1 - Vikram
  {
    id: 'osr-in-speaker-1',
    name: 'Vikram / OSR (Delhi Studio Announcer)',
    speaker: 'Real Human Male (Open Speech Repository India)',
    gender: 'Male',
    accent: 'IN',
    transcript: 'Standardized acoustic speech recording for international telecommunications testing.',
    url: '/samples/osr_in_speaker_1.wav',
    attribution: 'Open Speech Repository (OSR Indian English Speech Series)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 68.3,
    category: 'Open Speech Repository (Harvard Sentences)',
  },

  // 39. OSR France Speaker 1 - Étienne
  {
    id: 'osr-fr-speaker-1',
    name: 'Étienne / OSR (Parisian Radio Presenter)',
    speaker: 'Real Human Male (Open Speech Repository France)',
    gender: 'Male',
    accent: 'EU',
    transcript: 'Enregistrement acoustique de référence pour les systèmes de télécommunications.',
    url: '/samples/osr_fr_speaker_1.wav',
    attribution: 'Open Speech Repository (OSR French Speech Series)',
    license: 'Free Open License (Credit to Open Speech Repository)',
    duration: 79.6,
    category: 'Open Speech Repository (Harvard Sentences)',
  },
];

// In-memory AudioBuffer cache
const audioBufferCache = new Map<string, AudioBuffer>();

let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * Fetch and decode a human voice sample into an AudioBuffer
 */
export async function loadHumanVoiceBuffer(sampleUrl: string): Promise<AudioBuffer> {
  const cached = audioBufferCache.get(sampleUrl);
  if (cached) return cached;

  const ctx = getSharedAudioContext();
  const response = await fetch(sampleUrl);
  if (!response.ok) {
    throw new Error(`Failed to load voice sample from ${sampleUrl}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  audioBufferCache.set(sampleUrl, decoded);
  return decoded;
}

/**
 * Decode custom user uploaded audio file (or recorded mic blob)
 */
export async function decodeCustomAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = getSharedAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
}
