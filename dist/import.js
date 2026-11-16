// English in-game advanced clipboard text. Never infer tiers from a mod name.
const number = '[+-]?\\d+(?:\\.\\d+)?';
const values = new RegExp(`(${number})(?:\\((${number})(?:-(${number}))?\\))?`, 'g');
const precision = s => (s.split('.')[1] || '').length;
const copyHelp = 'Copy the advanced item description in English (hover the item, then Ctrl+Alt+C with the default advanced-description binding). It must include { Prefix/Suffix Modifier ... } headers and value(min-max) ranges.';

export function parseItem(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Paste your item text first.');
  if (text.length > 50000) throw new Error('This paste is too long. Paste one item at a time.');
  const normalized = text.replace(/\r\n?/g, '\n').replace(/[\u2212\u2013]/g, '-').replace(/^\uFEFF/, '');
  const lines = normalized.split('\n').map(s => s.trim());
  if (lines.filter(s => /^Rarity:/.test(s)).length !== 1) throw new Error(`Paste one complete item. ${copyHelp}`);
  if (!lines.includes('Rarity: Rare')) throw new Error('Import currently supports rare equipment only.');
  if (lines.some(s => /^Unidentified$/i.test(s)))
    throw new Error('Unidentified items are outside this calculator’s model: their modifiers are not visible.');
  const itemFlags = lines.filter(s => /^(Corrupted|Mirrored|Unmodifiable)$/i.test(s));
  if (lines.some(s => /^Quality \([^)]+\):/.test(s)) || /increased (?:Effect|Magnitude) of.*Modifiers/i.test(normalized))
    throw new Error('Catalyst quality or modifier-effect scaling is not supported. Use unscaled ranges in the manual editor.');
  const itemClass = lines.find(s => s.startsWith('Item Class:'))?.slice(11).trim();
  if (!itemClass || /Maps?|Flasks?|Jewels?|Tinctures?|Heist|Waystones?|Tablets?|Logbooks?/i.test(itemClass))
    throw new Error('Import supports rare equipment with up to three prefixes and three suffixes.');
  const nameIndex = lines.indexOf('Rarity: Rare') + 1;
  const itemName = lines[nameIndex]?.slice(0,120) || 'Imported item';
  const groups = [];
  let active = null, headerCount = 0;
  for (const line of lines) {
    if (/^-{4,}$/.test(line)) {active = null; continue;}
    if (line.startsWith('{')) {
      headerCount++;
      if (!line.endsWith('}')) throw new Error('An incomplete modifier header was pasted. Copy the complete item again.');
      active = null;
      const side = line.match(/\b(Prefix|Suffix) Modifier\b/i)?.[1].toLowerCase();
      if (side) {
        active = {side, header:line, lines:[], crafted:/Crafted/i.test(line), fractured:/\bFractured\b/i.test(line)};
        groups.push(active);
      } else if (!/Implicit|Enchant|Scourge|Crucible|Rune/i.test(line)) {
        throw new Error(`Unsupported modifier header: ${line.slice(0,120)}`);
      }
    } else if (active && line && !line.startsWith('(')) {
      active.lines.push(line);
      if (/\(crafted\)/i.test(line)) active.crafted = true;
      if (/\(fractured\)/i.test(line)) active.fractured = true;
    }
  }
  if (!headerCount || !groups.length) throw new Error(copyHelp);
  const sides = {prefix:[], suffix:[]}, notes = new Set();
  if (itemFlags.length) notes.add(`${itemFlags.join(', ')} flags are ignored for this modifiable-item planning model.`);
  if (lines.some(s => /^Fractured Item$/i.test(s)) && !groups.some(g => g.fractured))
    throw new Error('The item is fractured, but no modifier is marked (fractured). Copy the full advanced text so the fixed modifier can be identified.');
  if (groups.some(g => g.fractured)) notes.add('Fractured modifiers stay at their copied values and are excluded from Divine targets. They still occupy affix slots and can receive a random lock.');
  for (const group of groups) {
    if (!group.lines.length) throw new Error('A modifier header has no stat text. Copy the complete item again.');
    const description = group.lines.join(' / ');
    if (/cannot be changed|Cannot roll|Can have up to \d+ Crafted Modifiers/i.test(description))
      throw new Error('This item has a metacraft. Remove the metacraft and copy it again before importing; it must not be mistaken for a normal roll.');
    if (/\(augmented\)|\(mutated\)|\(desecrated\)/i.test(description))
      throw new Error('A modifier has scaled or special values that this importer cannot safely interpret. Use the manual editor.');
    const rolls = [], fixed = [];
    for (const line of group.lines) {
      // Strip reminder/type markers, but retain numeric range parentheses.
      const stat = line.replace(/\s*(?:--|—) Unscalable Value.*$/i,'').replace(/\((?:crafted|fractured|implicit|enchant)\)/gi,'').trim();
      const matches = [...stat.matchAll(values)];
      const residue = stat.replace(values,'#');
      if (/\([^)]*[\d#]/.test(residue)) throw new Error(`Missing a current value or unsupported range in: ${line}`);
      for (const match of matches) {
        const current = Number(match[1]);
        if (match[2] === undefined) {fixed.push(current); continue;}
        const first = Number(match[2]), last = Number(match[3] ?? match[2]);
        const min = Math.min(first,last), max = Math.max(first,last);
        if (current < min - 1e-8 || current > max + 1e-8) throw new Error(`Copied value is outside its raw range in: ${line}. Scaled values need manual entry.`);
        if (min === max) {fixed.push(current); continue;}
        const digits = Math.max(precision(match[1]),precision(match[2]),precision(match[3] ?? match[2]));
        if (digits > 4) throw new Error('More than four decimal places is unsupported.');
        if (digits) notes.add('Decimal step sizes are inferred from the copied precision. Check Step for decimal modifiers.');
        rolls.push({min,max,step:10 ** -digits,target:max,direction:'atLeast',current});
      }
    }
    // Constant components do not add probability factors, but a wholly fixed
    // modifier still occupies one randomly protectable modifier slot.
    if (!rolls.length) {
      const constants = group.fractured && fixed.length ? fixed : [fixed.length === 1 ? fixed[0] : 1];
      for (const value of constants) rolls.push({min:value,max:value,step:1,target:value,direction:'atLeast',current:value});
    }
    if (rolls.length > 3) throw new Error('A modifier has more than three independent numeric rolls; use a supported item.');
    const name = group.lines.map(s => s.replace(values,'#').replace(/\s*(?:--|—) Unscalable Value.*$/i,'').replace(/\((?:crafted|fractured)\)/gi,'').trim()).join(' / ').slice(0,120);
    if (group.fractured) rolls.forEach(r => {r.target = r.current;});
    sides[group.side].push({name, rolls, hit:group.fractured || rolls.every(r => r.current === r.target), source:description.slice(0,500), crafted:group.crafted, fractured:group.fractured});
  }
  if (sides.prefix.length > 3 || sides.suffix.length > 3) throw new Error('More than three modifiers were found on one side. This item is not supported.');
  const anyCraft = groups.some(g => g.crafted);
  const banks = {};
  for (const side of ['prefix','suffix']) {
    const opposite = side === 'prefix' ? 'suffix' : 'prefix';
    const canCraft = sides[opposite].length < 3 && !anyCraft;
    const reason = sides[opposite].length === 3 ? `All three ${opposite} slots are occupied. Lock strategies need a free ${opposite} slot.` : anyCraft ? 'An existing bench craft prevents adding a lock in this model. Remove it and re-copy the item to compare locks.' : '';
    banks[side] = {mods:sides[side],canCraft,reason,initialCraft:0,specific:Math.max(0,sides[side].findIndex(m => !m.fractured))};
  }
  notes.add('Targets default to the highest numeric values. Change the target rule for stats where lower is better.');
  return {itemName,itemFlags,banks,notes:[...notes]};
}

export function atTarget(mod) {
  if (mod.fractured) return true;
  if (!mod.rolls.every(r => Number.isFinite(r.current))) return mod.hit;
  return mod.rolls.every(r => r.direction === 'atMost' ? r.current <= r.target + 1e-8 : r.direction === 'exact' ? Math.abs(r.current-r.target) < 1e-8 : r.current >= r.target - 1e-8);
}

export const EXAMPLE_ITEM = `Item Class: Body Armours
Rarity: Rare
Storm Shelter
Astral Plate
--------
Armour: 1250
--------
Item Level: 86
--------
{ Implicit Modifier — Elemental, Resistance }
+12(8-12)% to all Elemental Resistances (implicit)
--------
{ Prefix Modifier "Healthy" (Tier: 2) — Life }
+104(100-109) to maximum Life
{ Prefix Modifier "Stalwart" (Tier: 2) — Defences }
120(110-120)% increased Armour
{ Prefix Modifier "Hybrid" (Tier: 2) — Defences }
39(39-42)% increased Armour
16(16-17)% increased Stun and Block Recovery
{ Suffix Modifier "of the Furnace" (Tier: 1) — Elemental, Fire, Resistance }
+48(46-48)% to Fire Resistance
{ Suffix Modifier "of the Titan" (Tier: 1) — Attribute }
+52(51-55) to Strength`;
