import { EXERCISES } from '../domain/catalog.js';

// Generic equipment silhouettes: seat/pads, frame and human have separate visual layers.
// These illustrate movement families, not the appearance of a particular user's machine.
const chair = 'M30 30V73H69M38 73V96M65 73V96';
const seated = {head:[42,21], body:'M42 33V65L69 69L76 94', equipment:chair};
const standing = {head:[55,15], body:'M55 27V58M55 58L40 94M55 58L72 94'};
const POSES = {
  horizontal_push: {...seated, limbs:'M43 39L64 50L88 46', ghost:'M43 39L51 56L62 43', arrows:['M66 29H93']},
  incline: {...seated, body:'M42 33L34 65L68 70L76 94', limbs:'M41 40L64 34L77 18', ghost:'M41 40L53 56L64 38', arrows:['M77 42L94 22']},
  horizontal_pull: {...seated, limbs:'M43 40L54 57L65 44', ghost:'M43 40L70 44L93 43', equipment:chair+'M102 34V81M65 44H102', arrows:['M94 24H65']},
  vertical_pull: {...seated, limbs:'M43 39L63 47L75 34', ghost:'M43 39L57 23L69 9', equipment:chair+'M93 10V96M50 9H93', arrows:['M89 23V53']},
  vertical_push: {...seated, limbs:'M43 39L62 25L65 7', ghost:'M43 39L65 46L73 29', arrows:['M91 48V16']},
  knee_dominant: {head:[60,26], body:'M56 37L42 63L68 77L50 96', limbs:'M54 41L77 48L90 43', ghost:'M57 32L56 63L54 96', arrows:['M26 79V42']},
  leg_press: {head:[26,38], body:'M28 49L41 79L65 61L86 47', limbs:'M29 53L37 72', ghost:'M41 79L67 78L72 51', equipment:'M15 41L30 84H51M25 84V98M82 37L99 57', arrows:['M58 43L78 27']},
  leg_extension: {...seated, body:'M42 33V65L69 69L96 57', limbs:'M43 42L39 66', ghost:'M69 69L76 94', arrows:['M89 89Q109 80 102 62']},
  knee_flexion: {...seated, limbs:'M43 42L39 66', ghost:'M69 69L96 57', arrows:['M102 62Q108 82 88 91']},
  elbow_flexion: {...seated, limbs:'M43 39L63 61L69 35', ghost:'M63 61L87 66', arrows:['M93 62Q96 42 83 33']},
  hip_adduction: {head:[56,18], body:'M56 30V58M56 58L41 77L42 97M56 58L71 77L70 97', limbs:'M56 35L37 52M56 35L75 52', ghost:'M56 58L24 75L19 97M56 58L88 75L93 97', equipment:'M39 32H73M32 60H80M37 60V92M75 60V92', arrows:['M13 69H35','M99 69H77']},
  hip_abduction: {head:[56,18], body:'M56 30V58M56 58L24 75L19 97M56 58L88 75L93 97', limbs:'M56 35L37 52M56 35L75 52', ghost:'M56 58L41 77L42 97M56 58L71 77L70 97', equipment:'M39 32H73M32 60H80M37 60V92M75 60V92', arrows:['M35 66H12','M77 66H100']},
  assisted_pull: {head:[56,33], body:'M56 44V68L76 76L66 89', limbs:'M56 47L37 32L34 12M56 47L75 32L78 12', equipment:'M20 97V9H92V97M47 88H77', arrows:['M100 74V40']},
  assisted_dip: {head:[55,23], body:'M55 35L56 63L74 79L58 89', limbs:'M55 40L37 52L38 68', equipment:'M25 65H43M31 65V98M48 89H78', ghost:'M55 40L38 38L38 65', arrows:['M91 63V29']},
  hip_hinge: {head:[80,36], body:'M70 40L47 62L45 80L34 97', limbs:'M66 43L64 70L72 82', ghost:'M47 62L52 30', arrows:['M83 22Q65 8 49 17']},
  hip_extension: {head:[21,85], body:'M32 88L55 65L78 63L96 92', limbs:'M34 89H52', ghost:'M32 88L57 91L78 63', equipment:'M9 98H106', arrows:['M52 54V32']},
  core_anti_extension: {head:[20,85], body:'M31 89H64L81 62L101 91', limbs:'M37 89L46 79H61', equipment:'M8 98H108', arrows:['M62 76V62']},
  dead_bug: {head:[20,86], body:'M31 89H60L68 58L96 59', limbs:'M39 89L41 51', ghost:'M60 89L96 91M39 89L18 55', equipment:'M8 98H107', arrows:['M85 71L99 84']},
  core_anti_rotation: {...standing, limbs:'M55 36L75 46L94 40', equipment:'M101 8V94M94 40H101', arrows:['M96 60H77']},
  single_leg_balance: {...standing, body:'M55 27V57L47 96M55 57L78 65L66 83', limbs:'M55 35L29 48M55 35L83 44'},
  ankle: {...standing, body:'M55 27V58L53 88L66 96M55 58L74 87L84 95', limbs:'M55 35L73 49', ghost:'M53 88L47 97', arrows:['M30 84V59']},
};
const OVERRIDES = {
  incline_chest_press:'incline', leg_press:'leg_press', leg_extension:'leg_extension',
  assisted_pull_up:'assisted_pull', assisted_chinup:'assisted_pull', assisted_dip:'assisted_dip', dead_bug:'dead_bug',
};
const EQUIPMENT = {
  horizontal_push: {frame:'M16 98H101M24 98V24M24 24H35M91 98V35L81 28M81 28L66 45',pads:'M33 36V64M34 70H65',stack:[14,48],grips:'M63 43L69 49'},
  incline: {frame:'M15 99H101M23 98L19 71L33 28M88 98V12L70 12',pads:'M29 43L24 64M29 71H63',stack:[89,46],grips:'M73 17L81 21'},
  horizontal_pull: {frame:'M14 99H104M26 98V74H73M100 97V25',pads:'M35 70H66M54 45V60',stack:[94,56],grips:'M61 41L68 47'},
  vertical_pull: {frame:'M15 99H103M95 99V8H45M68 9V29',pads:'M32 70H66M62 63H78',stack:[87,58],grips:'M65 30L82 35'},
  vertical_push: {frame:'M17 98H99M25 98V29M89 98V19L69 9',pads:'M33 37V64M34 71H66',stack:[85,53],grips:'M60 8L70 8'},
  leg_extension: {frame:'M19 98H100M28 98V28M31 75H72L93 57',pads:'M33 36V63M36 72H67M89 56L96 60',stack:[17,56],pivot:[70,72]},
  knee_flexion: {frame:'M19 98H100M28 98V28M31 75H72L78 96',pads:'M33 36V63M36 72H65M65 62H77M72 92L80 92',stack:[17,56],pivot:[70,72]},
  elbow_flexion: {frame:'M17 98H103M29 98V35M68 97V53L89 65',pads:'M33 39V64M36 72H66M49 51L63 58',stack:[91,62],pivot:[68,63]},
  hip_adduction: {frame:'M19 99H93M35 31H77M35 31V74H77V31M56 74V97',pads:'M44 35H68M42 61H70M33 74L31 83M79 74L81 83'},
  hip_abduction: {frame:'M19 99H93M35 31H77M35 31V74H77V31M56 74V97',pads:'M44 35H68M42 61H70M30 69L26 80M82 69L86 80'},
  leg_press: {frame:'M10 99H107M20 91L91 30M38 97L106 37M80 33L101 54',pads:'M17 48L29 76M32 84H46M84 36L99 51'},
  knee_dominant: {frame:'M13 100H105M22 97L40 10M91 97L105 13M41 10H105M40 44L82 29',pads:'M47 36L39 56M40 97H74',plates:[89,30]},
  assisted_pull: {frame:'M12 100H102M20 98V7H92V98M20 7H92M46 93H77',pads:'M47 87H76',stack:[84,50],grips:'M28 9H40M72 9H84'},
  assisted_dip: {frame:'M12 100H102M23 98V13H89V98M23 62H43M47 94H79',pads:'M48 89H77',stack:[83,25],grips:'M29 63H43'},
  core_anti_rotation: {frame:'M94 98H109M104 98V8',stack:[97,58],grips:'M90 37L96 43'},
};
let illustrationId = 0;
const svgElement = (tag, attributes = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key,value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};

export function exerciseIllustration(exerciseId) {
  const exercise = EXERCISES.find(item => item.id === exerciseId);
  if (!exercise) return null;
  const poseId = OVERRIDES[exerciseId] ?? exercise.pattern;
  const pose = POSES[poseId];
  const equipment = exerciseId === 'squat' ? null : EQUIPMENT[poseId];
  const svg = svgElement('svg', {viewBox:'0 0 112 108', class:'exercise-illustration', role:'img',
    'aria-label':`${exercise.name}動作示意`, focusable:'false'});
  const title = svgElement('title');
  title.textContent = `${exercise.name} · 動作示意，非特定機型`;
  svg.append(title);
  const markerId = `exercise-arrow-${++illustrationId}`;
  const defs = svgElement('defs');
  const marker = svgElement('marker', {id:markerId,viewBox:'0 0 8 8',refX:'6',refY:'4',markerWidth:'8',markerHeight:'8',orient:'auto',markerUnits:'userSpaceOnUse'});
  marker.append(svgElement('path', {d:'M1 1L6 4L1 7',fill:'none',stroke:'var(--accent)','stroke-width':'2'}));
  defs.append(marker);
  svg.append(defs);
  const path = (d, className) => {if(d) svg.append(svgElement('path',{d,class:className}));};
  svg.append(svgElement('ellipse',{cx:56,cy:101,rx:48,ry:4,class:'exercise-ground'}));
  path(equipment?.frame ?? pose.equipment,'exercise-frame');
  if (equipment?.stack) {
    const [x,y]=equipment.stack;
    svg.append(svgElement('rect',{x:x-4,y:y-3,width:12,height:36,rx:3,class:'exercise-stack-shell'}));
    for(let i=0;i<6;i++) svg.append(svgElement('rect',{x:x-2,y:y+i*5,width:8,height:3,rx:1,class:'exercise-stack-plate'}));
  }
  if (equipment?.plates) {
    const [cx,cy]=equipment.plates;
    svg.append(svgElement('circle',{cx,cy,r:10,class:'exercise-stack-shell'}),svgElement('circle',{cx,cy,r:3,class:'exercise-stack-plate'}));
  }
  path(equipment?.pads,'exercise-pad');
  path(pose.ghost,'exercise-ghost');
  path(pose.body,'exercise-person');
  path(pose.body.split('L')[0],'exercise-shirt');
  path(pose.limbs,'exercise-limb');
  svg.append(svgElement('circle',{cx:pose.head[0],cy:pose.head[1],r:'7',class:'exercise-head'}));
  path(equipment?.grips,'exercise-grip');
  if(equipment?.pivot)svg.append(svgElement('circle',{cx:equipment.pivot[0],cy:equipment.pivot[1],r:3,class:'exercise-stack-plate'}));
  for (const d of pose.arrows ?? []) svg.append(svgElement('path',{d,class:'exercise-motion','marker-end':`url(#${markerId})`}));
  return svg;
}
