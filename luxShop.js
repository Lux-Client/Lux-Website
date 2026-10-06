/* Lux Credits shop: prices of everything a Lux Client player can unlock.

   Item ids:
     cosmetic:<id>   hats, ears, glasses, necklaces, pets, backpacks, wings, tails, auras
     emote:<id>      emotes (duo emotes included)
     name:color:<n>  name colour mode n (1..7, 0 = normal is free)
     name:anim:<n>   name animation n (1..4, 0 = none is free)
     name:bold       bold name
     name:line       custom second line under the name
     line:color:<n>  colour mode n for the second line (like name:color)
     line:anim:<n>   animation n for the second line
     line:bold       bold second line

   These are the DEFAULT prices: admins change prices in the admin panel (Lux Shop tab,
   table lux_prices) and every mod picks the change up within seconds.
   Price 0 = free for everybody. Credits are only handed out by admins (giveaways),
   they cannot be bought. Ids the mod knows but this list does not are not for sale. */

const PRICES = {
    // ---------------------------------------------------------------- name style
    'name:color:1': 100,  // fixed colour
    'name:color:2': 200,  // gradient
    'name:color:3': 300,  // rainbow
    'name:color:4': 200,  // pulse
    'name:color:5': 300,  // sparkle
    'name:color:6': 400,  // fire
    'name:color:7': 400,  // ice
    'name:anim:1': 200,   // wave
    'name:anim:2': 300,   // bounce
    'name:anim:3': 200,   // float
    'name:anim:4': 500,   // shake
    'name:bold': 100,
    'name:line': 2500,
    'line:color:1': 100, 'line:color:2': 200, 'line:color:3': 300, 'line:color:4': 200,
    'line:color:5': 300, 'line:color:6': 400, 'line:color:7': 400,
    'line:anim:1': 200, 'line:anim:2': 300, 'line:anim:3': 200, 'line:anim:4': 500,
    'line:bold': 100,

    // ---------------------------------------------------------------- emotes
    'emote:wave': 0,
    'emote:clap': 1000, 'emote:point': 1000, 'emote:thumbs_up': 1000, 'emote:salute': 1000,
    'emote:shrug': 1000, 'emote:facepalm': 1000, 'emote:think': 1000, 'emote:bow': 1000,
    'emote:scratch_head': 1000, 'emote:yawn': 1000, 'emote:stretch': 1000, 'emote:pray': 1000,
    'emote:cry': 1000, 'emote:laugh': 1000, 'emote:heart_hands': 1500, 'emote:zombie': 1000,
    'emote:tpose': 1000, 'emote:sit': 1500,
    'emote:cheer': 2000, 'emote:dab': 2000, 'emote:jumping_jack': 2000, 'emote:airplane': 2000,
    'emote:boxing': 2000, 'emote:headbang': 2000, 'emote:chicken': 2500,
    'emote:dance': 3000, 'emote:floss': 3000, 'emote:robot': 3000, 'emote:air_guitar': 3000,
    'emote:air_drums': 3000,
    'emote:high_five': 2500, 'emote:fist_bump': 2500, 'emote:handshake': 2500, 'emote:hug': 2500,
    'emote:partner_dance': 5000,
    // premium emotes (props, sounds)
    'emote:six_seven': 3000, 'emote:l_dance': 4000, 'emote:web_hang': 5000, 'emote:cat_cuddle': 5000,

    // ---------------------------------------------------------------- cosmetics: head
    'cosmetic:cap': 0,
    'cosmetic:beanie': 500, 'cosmetic:bandana': 500, 'cosmetic:party_hat': 600, 'cosmetic:chef_hat': 700,
    'cosmetic:cowboy_hat': 800, 'cosmetic:santa_hat': 800, 'cosmetic:headphones': 900,
    'cosmetic:flower_crown': 900, 'cosmetic:top_hat': 1000, 'cosmetic:horns': 1000,
    'cosmetic:wizard_hat': 1200, 'cosmetic:viking_helmet': 1200, 'cosmetic:unicorn_horn': 1200,
    'cosmetic:propeller_cap': 1300, 'cosmetic:halo': 1500, 'cosmetic:crown': 2000,
    // ears
    'cosmetic:bear_ears': 400, 'cosmetic:panda_ears': 400, 'cosmetic:cat_ears': 500,
    'cosmetic:fox_ears': 500, 'cosmetic:bunny_ears': 500, 'cosmetic:elf_ears': 600,
    // face
    'cosmetic:clown_nose': 300, 'cosmetic:mustache': 400, 'cosmetic:eye_patch': 400,
    'cosmetic:monocle': 500, 'cosmetic:glasses_3d': 500, 'cosmetic:sunglasses': 600,
    'cosmetic:heart_glasses': 700, 'cosmetic:ninja_mask': 800,
    // neck
    'cosmetic:bow_tie': 0, 'cosmetic:tie': 400, 'cosmetic:scarf': 600, 'cosmetic:medal': 800,
    'cosmetic:gold_chain': 1000, 'cosmetic:diamond_chain': 1500,
    // shoulder pets
    'cosmetic:chick': 1200, 'cosmetic:parrot': 1500, 'cosmetic:shoulder_cat': 1500,
    'cosmetic:shoulder_fox': 1500, 'cosmetic:frog': 1500, 'cosmetic:bee': 1800,
    'cosmetic:axolotl': 1800, 'cosmetic:penguin': 1800, 'cosmetic:owl': 1800, 'cosmetic:slime': 2000,
    'cosmetic:ghost': 2500, 'cosmetic:baby_dragon': 3000,
    // back
    'cosmetic:backpack': 800, 'cosmetic:quiver': 900, 'cosmetic:sword_back': 1200,
    'cosmetic:guitar': 1200, 'cosmetic:jetpack': 2500,
    // wings
    'cosmetic:bat_wings': 2000, 'cosmetic:butterfly_wings': 2500, 'cosmetic:fairy_wings': 2500,
    'cosmetic:angel_wings': 3000, 'cosmetic:dragon_wings': 3500, 'cosmetic:demon_wings': 3500,
    'cosmetic:phoenix_wings': 4000,
    'cosmetic:big_fairy_wings': 5000, 'cosmetic:gothic_moth_wings': 6000, 'cosmetic:crystal_wings': 6000,
    'cosmetic:spirit_flame_wings': 6500,
    // tails
    'cosmetic:bunny_tail': 500, 'cosmetic:cat_tail': 800, 'cosmetic:wolf_tail': 800,
    'cosmetic:devil_tail': 900, 'cosmetic:fox_tail': 1000, 'cosmetic:dragon_tail': 1500,
    // auras
    'cosmetic:aura_snow': 1500, 'cosmetic:aura_hearts': 1500, 'cosmetic:aura_bubbles': 1500,
    'cosmetic:aura_stars': 2000, 'cosmetic:aura_music': 2000, 'cosmetic:aura_cherry': 2000,
    'cosmetic:aura_fire': 2500, 'cosmetic:aura_magic': 2500, 'cosmetic:aura_souls': 2500,
    'cosmetic:aura_lightning': 3000, 'cosmetic:aura_rainbow': 3000,
    'cosmetic:aura_leaves': 3500, 'cosmetic:aura_style_stars': 3500, 'cosmetic:aura_ender': 4000,
    'cosmetic:aura_lightning_energy': 4000,
    // pets on the head
    'cosmetic:head_frog': 2500, 'cosmetic:head_cat': 3000, 'cosmetic:raccoon': 3000, 'cosmetic:baby_bear': 3000
};

const ITEM_RE = /^(cosmetic|emote):[a-z0-9_]{1,32}$|^name:(color:[1-7]|anim:[1-4]|bold|line)$|^line:(color:[1-7]|anim:[1-4]|bold)$/;
const NAMES = require('./luxShopNames');

/** Price of an item, or null if it is not for sale. */
function price(item) {
    return Object.prototype.hasOwnProperty.call(PRICES, item) ? PRICES[item] : null;
}

function isFree(item) {
    return price(item) === 0;
}

/** Readable name for the admin panel. */
function itemName(item) {
    return (NAMES[item] && NAMES[item].name) || item;
}

/** Group for the admin panel (Head, Wings, Emotes, Name style ...). */
function category(item) {
    if (NAMES[item]) return NAMES[item].category;
    if (item.startsWith('emote:')) return 'Emotes';
    if (item.startsWith('name:')) return 'Name style';
    if (item.startsWith('line:')) return 'Second line';
    return 'Other';
}

module.exports = { PRICES, ITEM_RE, price, isFree, itemName, category };
