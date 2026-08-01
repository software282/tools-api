// Curated standard FTC parts for the global library.
// `manufacturerSlug` and `category` must match the slugs seeded in seed.ts.
// URLs/SKUs verified against each manufacturer's own product pages.
// This file is expanded over time; teams/admins also add parts in-app.

export interface SeedPart {
  manufacturerSlug: string;
  name: string;
  sku: string | null;
  category: string; // category slug
  productUrl: string;
  purchaseUrl?: string;
  imageUrl?: string;
  description?: string;
}

/**
 * Stand-in for parts whose vendor page exposes no usable product image.
 *
 * A self-contained SVG data URI rather than a hosted file: it needs no bucket,
 * no CDN, and no deployed base URL, so it renders identically in local dev and
 * in production. A frontend can spot one with `imageUrl.startsWith("data:")` if
 * it wants to style these differently.
 *
 * Replace by dropping a real URL into the part below, or by re-running
 * `npm run images`, which treats a placeholder as still-missing.
 */
export const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MDAgMzAwIiByb2xlPSJpbWciIGFyaWEtbGFiZWw9IlByb2R1Y3QgaW1hZ2UgY29taW5nIHNvb24iPjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjZjFmM2Y1Ii8+PHJlY3QgeD0iMC41IiB5PSIwLjUiIHdpZHRoPSIzOTkiIGhlaWdodD0iMjk5IiBmaWxsPSJub25lIiBzdHJva2U9IiNjZWQ0ZGEiIHN0cm9rZS1kYXNoYXJyYXk9IjggNiIvPjxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2FkYjViZCIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIxNTAiIHk9IjEwNiIgd2lkdGg9IjEwMCIgaGVpZ2h0PSI3OCIgcng9IjYiLz48cGF0aCBkPSJNMTUwIDE2NGwyNi0yNCAyMCAxOCAyNi0zMCAyOCAzMiIvPjwvZz48Y2lyY2xlIGN4PSIxNzgiIGN5PSIxMzAiIHI9IjciIGZpbGw9IiNhZGI1YmQiLz48dGV4dCB4PSIyMDAiIHk9IjIxNiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLFNlZ29lIFVJLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM4NjhlOTYiPkltYWdlIGNvbWluZyBzb29uPC90ZXh0Pjwvc3ZnPg==';

export const standardParts: SeedPart[] = [
  // ── goBILDA ──────────────────────────────────────────────────────────
  {
    manufacturerSlug: 'gobilda',
    name: '5203 Series Yellow Jacket Planetary Gear Motor (19.2:1, 8mm REX, 312 RPM, 3.3-5V Encoder)',
    sku: '5203-2402-0019',
    imageUrl: 'https://cdn11.bigcommerce.com/s-x56mtydx1w/products/1488/images/14802/5203-2402-0019__61087.1746574716.386.513.jpg?c=1',
    category: 'motors',
    productUrl:
      'https://www.gobilda.com/5203-series-yellow-jacket-planetary-gear-motor-19-2-1-ratio-24mm-length-8mm-rex-shaft-312-rpm-3-3-5v-encoder/',
    description:
      'The iconic 12V Yellow Jacket brushed planetary gearmotor with built-in encoder and 8mm REX output; 312 RPM is the most common FTC drivetrain choice.',
  },
  {
    manufacturerSlug: 'gobilda',
    name: '2000 Series Dual Mode Servo (25-2, Torque)',
    sku: '2000-0025-0002',
    imageUrl: 'https://cdn11.bigcommerce.com/s-x56mtydx1w/products/1190/images/5970/2000-0025-0002__75515__83589.1701992706.386.513.jpg?c=1',
    category: 'servos',
    productUrl: 'https://www.gobilda.com/2000-series-dual-mode-servo-25-2-torque/',
    description:
      'Steel-geared 25-tooth-spline servo switchable between 300-degree positional and continuous-rotation modes; high-torque variant.',
  },
  {
    manufacturerSlug: 'gobilda',
    name: '2000 Series Dual Mode Servo (25-3, Speed)',
    sku: '2000-0025-0003',
    imageUrl: 'https://cdn11.bigcommerce.com/s-x56mtydx1w/products/1346/images/6599/2000-0025-0003__96108__04560.1701992903.386.513.jpg?c=1',
    category: 'servos',
    productUrl: 'https://www.gobilda.com/2000-series-dual-mode-servo-25-3-speed/',
    description: 'The faster (~115 RPM at 6V) version of the 2000 Series dual-mode servo.',
  },
  {
    manufacturerSlug: 'gobilda',
    name: '96mm Mecanum Wheel Set (70A Durometer Bearing Supported Rollers)',
    sku: '3213-3606-0002',
    imageUrl: 'https://cdn11.bigcommerce.com/s-x56mtydx1w/products/1445/images/7197/3213-3606-0002__85766__98186.1701993092.386.513.jpg?c=1',
    category: 'wheels',
    productUrl:
      'https://www.gobilda.com/96mm-mecanum-wheel-set-70a-durometer-bearing-supported-rollers/',
    description:
      'Set of four lightweight 96mm mecanum wheels with ball-bearing-supported rollers for omnidirectional FTC drivetrains.',
  },
  {
    manufacturerSlug: 'gobilda',
    name: '1309 Series Sonic Hub (8mm REX Bore)',
    sku: '1309-0016-4008',
    imageUrl: 'https://cdn11.bigcommerce.com/s-x56mtydx1w/products/1222/images/6086/1309-0016-4008__54144__86371.1701992744.386.513.jpg?c=1',
    category: 'shaft-attachments',
    productUrl: 'https://www.gobilda.com/1309-series-sonic-hub-8mm-rex-bore/',
    description:
      'Balanced aluminum clamping hub with 8mm REX bore and 16mm bolt pattern, for mounting wheels/gears to REX shafting.',
  },
  {
    manufacturerSlug: 'gobilda',
    name: '1120 Series U-Channel (17 Hole, 432mm Length)',
    sku: '1120-0017-0432',
    imageUrl: 'https://cdn11.bigcommerce.com/s-x56mtydx1w/products/260/images/2029/1120-0017-0432__23740__84720.1701991468.386.513.jpg?c=1',
    category: 'hardware',
    productUrl: 'https://www.gobilda.com/1120-series-u-channel-17-hole-432mm-length/',
    description:
      'Clear-anodized aluminum U-channel, the foundational structural element of the goBILDA build system.',
  },
  {
    manufacturerSlug: 'gobilda',
    name: '8mm REX Shaft Starter Pack',
    sku: '3201-0008-0001',
    imageUrl: 'https://cdn11.bigcommerce.com/s-x56mtydx1w/products/2267/images/13396/3201-0008-0001_8mm_REX_Shaft_Starter_Pack__72337__95226.1726859050.386.513.jpg?c=1',
    category: 'shafts',
    productUrl: 'https://www.gobilda.com/8mm-rex-shaft-starter-pack/',
    description:
      'Bundle of popular 2106 Series stainless 8mm REX shaft lengths plus hubs, bearings, couplers and hardware.',
  },

  // ── REV Robotics ─────────────────────────────────────────────────────
  {
    manufacturerSlug: 'rev',
    name: 'Control Hub',
    sku: 'REV-31-1595',
    imageUrl: 'https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/391/images/2736/IMG_20170502_154043_not_lm__25913.1650563042.500.500.png?c=2',
    category: 'electronics',
    productUrl: 'https://www.revrobotics.com/rev-31-1595/',
    description:
      'All-in-one Android-based FTC robot controller with built-in Wi-Fi; the primary brain of a REV control system.',
  },
  {
    manufacturerSlug: 'rev',
    name: 'Expansion Hub',
    sku: 'REV-31-1153',
    imageUrl: 'https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/216/images/2784/Expansion_Hub_One-noflag__63205.1650572103.500.500.png?c=2',
    category: 'electronics',
    productUrl: 'https://www.revrobotics.com/rev-31-1153/',
    description:
      'Adds motor, servo, and sensor ports to a Control Hub; same I/O as the Control Hub without wireless.',
  },
  {
    manufacturerSlug: 'rev',
    name: 'Driver Hub',
    sku: 'REV-31-1596',
    imageUrl: 'https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/598/images/2741/REV-31-1596-Driver_Hub-Iso_View-FINAL__03867.1650564025.500.500.png?c=2',
    category: 'electronics',
    productUrl: 'https://www.revrobotics.com/rev-31-1596/',
    description:
      'Dedicated Android driver-station device for connecting gamepads and driving an FTC robot.',
  },
  {
    manufacturerSlug: 'rev',
    name: 'HD Hex Motor (40:1 Spur Gearbox)',
    sku: 'REV-41-1301',
    imageUrl: 'https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/594/images/2931/Lone_HDHex-New_Sticker-noflag__98232.1659470612.500.500.png?c=2',
    category: 'motors',
    productUrl: 'https://www.revrobotics.com/rev-41-1301/',
    description:
      'HD Hex brushed motor with 40:1 spur gearbox, integrated encoder, and 5mm hex output; ~150 RPM.',
  },
  {
    manufacturerSlug: 'rev',
    name: 'Core Hex Motor',
    sku: 'REV-41-1300',
    imageUrl: 'https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/195/images/2675/REV-41-1300_Core_Hex5_not_lm__05075.1661790332.500.500.png?c=2',
    category: 'motors',
    productUrl: 'https://www.revrobotics.com/rev-41-1300/',
    description:
      'Compact geared motor with 5mm hex output and integrated encoder, popular for low-speed high-torque mechanisms.',
  },
  {
    manufacturerSlug: 'rev',
    name: 'Smart Robot Servo',
    sku: 'REV-41-1097',
    imageUrl: 'https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/115/images/2761/Smart_Robot_Servo_Photo_From_Bundle_Shot-noflag__84262.1650574026.500.500.png?c=2',
    category: 'servos',
    productUrl: 'https://www.revrobotics.com/rev-41-1097/',
    description:
      'Configurable metal-geared 25T servo; standard 270-degree, custom-angle, or continuous rotation via the SRS programmer.',
  },
  {
    manufacturerSlug: 'rev',
    name: '15mm Extrusion - 1m - 90 Degree Ends',
    sku: 'REV-41-1017',
    imageUrl: PLACEHOLDER_IMAGE,
    category: 'hardware',
    productUrl: 'https://www.revrobotics.com/rev-41-1017/',
    description:
      "1-meter length of REV's 15mm square building-system extrusion that accepts standard M3 hardware.",
  },
  {
    manufacturerSlug: 'rev',
    name: '12V Slim Battery',
    sku: 'REV-31-1302',
    imageUrl: 'https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/193/images/2367/REV-31-1302-12VSlimBattery-New-FINAL__87390.1636579008.500.500.png?c=2',
    category: 'electronics',
    productUrl: 'https://www.revrobotics.com/rev-31-1302/',
    description:
      '10-cell 12V 3000mAh low-profile NiMH robot battery with XT30 connector and inline 20A fuse.',
  },

  // ── Axon Robotics ────────────────────────────────────────────────────
  {
    manufacturerSlug: 'axon',
    name: 'Axon MAX MK2',
    imageUrl: 'https://cdn.shopify.com/s/files/1/0657/9182/0008/files/Perspective.png?v=1755499769',
    sku: null,
    category: 'servos',
    productUrl: 'https://axon-robotics.com/products/max',
    description:
      'Flagship high-performance brushless FTC servo with stainless steel gearbox and ~7.5W output; MK2 generation.',
  },
  {
    manufacturerSlug: 'axon',
    name: 'Axon MINI MK2',
    imageUrl: 'https://cdn.shopify.com/s/files/1/0657/9182/0008/files/Perspective_1b9841ad-db95-4986-9501-7c6478750401.png?v=1755500172',
    sku: null,
    category: 'servos',
    productUrl: 'https://axon-robotics.com/products/mini',
    description:
      'Compact brushless servo 10mm shorter than standard, same 7.5W output; common for claws, wrists, and pivots.',
  },
  {
    manufacturerSlug: 'axon',
    name: 'Axon MICRO+',
    imageUrl: 'https://cdn.shopify.com/s/files/1/0657/9182/0008/files/axonmicroresized.png?v=1699546035',
    sku: null,
    category: 'servos',
    productUrl: 'https://axon-robotics.com/products/micro',
    description:
      'Ultra-compact (~21g) brushless servo about 4x smaller than standard, for latches, light linkages, and claws.',
  },
  {
    manufacturerSlug: 'axon',
    name: 'Axon Servo Programmer',
    imageUrl: 'https://cdn.shopify.com/s/files/1/0657/9182/0008/products/Programmer.png?v=1662778773',
    sku: null,
    category: 'electronics',
    productUrl: 'https://axon-robotics.com/products/axon-servo-programmer',
    description:
      'Configuration tool for Axon programmable servos (mode, limits, current, deadband). Note: not compatible with MK2 servos.',
  },

  // ── Ferra Components ─────────────────────────────────────────────────
  {
    manufacturerSlug: 'ferra',
    name: '16AWG 20A XT30U Extension Cable',
    imageUrl: 'http://ferracomponents.com/cdn/shop/files/shortxt30cable_0d1f37cf-7add-40fc-9b0c-9099aef5cafc.png?v=1753924539',
    sku: null,
    category: 'electronics',
    productUrl: 'https://ferracomponents.com/products/16awg-xt30u-power-wire',
    description: 'Pre-made 16AWG power extension with XT30U connectors for FTC battery/power distribution.',
  },
  {
    manufacturerSlug: 'ferra',
    name: 'Parallel 20AWG Locking Servo Cable',
    imageUrl: 'http://ferracomponents.com/cdn/shop/files/servo1.png?v=1754027100',
    sku: null,
    category: 'electronics',
    productUrl: 'https://ferracomponents.com/products/20awg-locking-servo-wire',
    description: 'Servo extension cable with locking connectors to prevent disconnects during competition.',
  },
  {
    manufacturerSlug: 'ferra',
    name: 'Sensor/Odometry Cable (JST-PH 4-pin Male to 4-pin Male)',
    imageUrl: 'http://ferracomponents.com/cdn/shop/files/sensor_l1_a928989d-b6af-4a80-88f4-00fe7b727555.png?v=1753922898',
    sku: null,
    category: 'electronics',
    productUrl:
      'https://ferracomponents.com/products/encoder-cable-jst-ph-4-pin-male-to-4-pin-male',
    description: '4-pin JST-PH cable for connecting encoders/odometry pods and I2C sensors.',
  },
  {
    manufacturerSlug: 'ferra',
    name: 'XT30U Connectors (10 Pack)',
    imageUrl: 'http://ferracomponents.com/cdn/shop/files/xt30pair.png?v=1753925251',
    sku: null,
    category: 'electronics',
    productUrl: 'https://ferracomponents.com/products/xt30-connectors-10-pack',
    description: 'Ten-pack of XT30U power connectors for DIY FTC power cabling.',
  },
  {
    manufacturerSlug: 'ferra',
    name: 'Silicone Driver Hub Case',
    imageUrl: 'http://ferracomponents.com/cdn/shop/files/IMG_20251205_150508_HDR.jpg?v=1767078775',
    sku: null,
    category: 'misc',
    productUrl: 'https://ferracomponents.com/products/silicone-driver-hub-case',
    description: 'Protective silicone case for the REV Driver Hub.',
  },
  {
    manufacturerSlug: 'ferra',
    name: '48mm Vector Wheel Rollers V2',
    imageUrl: 'http://ferracomponents.com/cdn/shop/files/IMG_20260122_155959_HDR.jpg?v=1769119830',
    sku: null,
    category: 'wheels',
    productUrl: 'https://ferracomponents.com/products/48mm-vector-wheel-rollers-v2',
    description: 'Replacement rollers for 48mm vector/omni wheels.',
  },

  // ── MelonBotics ──────────────────────────────────────────────────────
  {
    manufacturerSlug: 'melonbotics',
    name: 'Super Servo Plus',
    imageUrl: 'https://www.melonbotics.com/cdn/shop/files/IMG-9951.jpg?v=1761482080',
    sku: null,
    category: 'servos',
    productUrl: 'https://www.melonbotics.com/products/super-servo-plus',
    description: 'High-speed (~1000 RPM) continuous-rotation servo for lightweight, fast intakes and outtakes.',
  },
  {
    manufacturerSlug: 'melonbotics',
    name: 'Magnum',
    imageUrl: 'https://www.melonbotics.com/cdn/shop/t/8/assets/melonbotics-social-share.png?v=103490722824745890631784027431',
    sku: null,
    category: 'motors',
    productUrl: 'https://www.melonbotics.com/products/magnum',
    description:
      'Brushless 550-size servo that is a drop-in replacement for 550-class motors (HD Hex, NeveRest, etc.).',
  },
  {
    manufacturerSlug: 'melonbotics',
    name: 'Encoder',
    imageUrl: 'https://www.melonbotics.com/cdn/shop/files/IMG-8624.jpg?v=1722879907',
    sku: null,
    category: 'electronics',
    productUrl: 'https://www.melonbotics.com/products/encoder',
    description: 'Magnetic rotary encoder for odometry and shaft position sensing.',
  },
  {
    manufacturerSlug: 'melonbotics',
    name: 'Nano Encoder',
    imageUrl: 'https://www.melonbotics.com/cdn/shop/files/DSC08830.jpg?v=1778307224',
    sku: null,
    category: 'electronics',
    productUrl: 'https://www.melonbotics.com/products/nano-encoder',
    description: 'Miniature magnetic encoder for compact odometry/position-feedback applications.',
  },
  {
    manufacturerSlug: 'melonbotics',
    name: 'Thin Section Bearings',
    imageUrl: 'https://www.melonbotics.com/cdn/shop/files/IMG-0642.jpg?v=1732100982',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.melonbotics.com/products/thin-section-bearings',
    description: 'Low-profile thin-section ball bearings for weight- and space-constrained mechanisms.',
  },
  {
    manufacturerSlug: 'melonbotics',
    name: 'PWM Extension Cables',
    imageUrl: 'https://www.melonbotics.com/cdn/shop/files/4594E189-627D-422F-8563-00B3B8E41ACC.jpg?v=1704254913',
    sku: null,
    category: 'electronics',
    productUrl: 'https://www.melonbotics.com/products/pwm-extension-cables',
    description: 'Servo/PWM extension cables for routing signal on FTC robots.',
  },

  // ── Offset Robotics ──────────────────────────────────────────────────
  {
    manufacturerSlug: 'offsetrobotics',
    name: 'Threaded Square Beam Bundle (64 pack)',
    imageUrl: 'https://www.offsetrobotics.com/wp-content/uploads/2025/10/Square-Beam-Thumbnail-scaled.png',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.offsetrobotics.com/product/threaded-square-beam-bundle/',
    description: 'Bundle of 64 CNC-machined threaded square beams for lightweight structural framing.',
  },
  {
    manufacturerSlug: 'offsetrobotics',
    name: '4 Hole Threaded Square Beam',
    imageUrl: 'https://www.offsetrobotics.com/wp-content/uploads/2025/10/4-Hole-Threaded-Square-Beam-scaled.png',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.offsetrobotics.com/product/4-hole-threaded-square-beam/',
    description: 'Single 4-hole threaded square structural beam.',
  },
  {
    manufacturerSlug: 'offsetrobotics',
    name: 'Angled Mounting Block Bundle (56 pack)',
    imageUrl: 'https://www.offsetrobotics.com/wp-content/uploads/2025/10/Mounting-Gusset-Bundle-scaled.png',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.offsetrobotics.com/product/angled-mounting-block-bundle/',
    description: 'Assortment of 56 angled gusset/mounting blocks for joining structure at angles.',
  },
  {
    manufacturerSlug: 'offsetrobotics',
    name: '45 Degree Mounting Block',
    imageUrl: 'https://www.offsetrobotics.com/wp-content/uploads/2025/11/45-scaled.png',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.offsetrobotics.com/product/45-degree-mounting-block/',
    description: '45-degree machined gusset block for angled structural connections.',
  },
  {
    manufacturerSlug: 'offsetrobotics',
    name: 'Ultimate Box Tube Kit (Combo Deal)',
    imageUrl: 'https://www.offsetrobotics.com/wp-content/uploads/2025/07/Your-paragraph-text41.png',
    sku: null,
    category: 'motion',
    productUrl: 'https://www.offsetrobotics.com/product/combo-deal-ultimate-box-tube-kit/',
    description:
      'Combo of box-tube telescoping linear-slide stages and spare hardware for multi-stage lifts.',
  },
  {
    manufacturerSlug: 'offsetrobotics',
    name: 'Offset Robotics Mounting Block',
    imageUrl: 'https://www.offsetrobotics.com/wp-content/uploads/2025/10/Offset-Robotics-Threaded-Mounting-Block-scaled.png',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.offsetrobotics.com/product/offset-robotics-mounting-block/',
    description: 'General-purpose machined mounting block for the Offset structure system.',
  },

  // ── MATA Robotics ────────────────────────────────────────────────────
  {
    manufacturerSlug: 'mata',
    name: 'MATA Torque Servo',
    imageUrl: 'http://www.matarobotics.net/cdn/shop/files/1b071bc639cb572e029de5f3592a369b.png?v=1772316643',
    sku: null,
    category: 'servos',
    productUrl: 'https://www.matarobotics.net/products/mata-torque-servo',
    description: 'High-torque FTC servo engineered and tested by an FTC team.',
  },
  {
    manufacturerSlug: 'mata',
    name: 'MATA Speed Servo',
    imageUrl: 'http://www.matarobotics.net/cdn/shop/files/364f331b1e9946ec8a58fd4a0bc9d2a4_2.png?v=1781791655',
    sku: null,
    category: 'servos',
    productUrl:
      'https://www.matarobotics.net/products/mata-micro-servo-beta-preorder-limited-release',
    description: "High-speed variant of MATA's competition servo line.",
  },
  {
    manufacturerSlug: 'mata',
    name: 'MATA Torque V2',
    imageUrl: 'http://www.matarobotics.net/cdn/shop/files/c188e7561ea8d2f0b65d9c8e065a207f.png?v=1782405662',
    sku: null,
    category: 'servos',
    productUrl: 'https://www.matarobotics.net/products/mata-torque-v2-beta-pre-order-phase',
    description: 'Second-generation MATA high-torque servo (beta/pre-order).',
  },
  {
    manufacturerSlug: 'mata',
    name: 'Servo Programmer',
    imageUrl: 'http://www.matarobotics.net/cdn/shop/files/ChatGPTImageJun19_2026_11_09_22AM.png?v=1781885472',
    sku: null,
    category: 'electronics',
    productUrl: 'https://www.matarobotics.net/products/servo-programmer',
    description: 'Programmer for configuring MATA programmable servos.',
  },
  {
    manufacturerSlug: 'mata',
    name: 'MATA Pro Servo Extension Cable (Shielded, Braided, FTC Legal)',
    imageUrl: 'http://www.matarobotics.net/cdn/shop/files/cb16519ee03af4a3710175983f9f5b85_0f7f460c-a8ef-4931-8147-6181faa2c33d.png?v=1772317876',
    sku: null,
    category: 'electronics',
    productUrl:
      'https://www.matarobotics.net/products/mata-pro-servo-extension-cable-shielded-braided-ftc-legal',
    description: 'Shielded, braided FTC-legal servo extension cable for noise-resistant signal runs.',
  },
  {
    manufacturerSlug: 'mata',
    name: '16T GT2 Pulleys',
    imageUrl: 'http://www.matarobotics.net/cdn/shop/files/Untitleddesign_1_a4b7258d-a370-475a-aecb-2e7d06ff21b3.png?v=1781882663',
    sku: null,
    category: 'shaft-attachments',
    productUrl: 'https://www.matarobotics.net/products/gt2-pulleys-beta-pre-order-phase-copy',
    description: '16-tooth GT2 timing-belt pulleys for FTC belt-drive mechanisms.',
  },

  // ── uxcell (Amazon; SKU = ASIN) ──────────────────────────────────────
  {
    manufacturerSlug: 'uxcell',
    name: 'uxcell 10pcs 2GT Timing Belt Closed Loop 96-2GT-6 (6mm Width x 96mm Length)',
    sku: 'B0CTKGLQ9N',
    imageUrl: PLACEHOLDER_IMAGE,
    category: 'belts',
    productUrl: 'https://www.amazon.com/uxcell-Timing-Closed-Rubber-Belts/dp/B0CTKGLQ9N',
    description: 'Ten-pack of 96mm closed-loop 2mm-pitch (GT2) 6mm-wide rubber timing belts.',
  },
  {
    manufacturerSlug: 'uxcell',
    name: 'uxcell 10pcs 2GT Timing Belt Closed Loop 150-2GT-6 (6mm Width x 150mm Length)',
    sku: 'B0CM6M1MYM',
    imageUrl: PLACEHOLDER_IMAGE,
    category: 'belts',
    productUrl: 'https://www.amazon.com/uxcell-Timing-Closed-150-2GT-6-Printer/dp/B0CM6M1MYM',
    description: 'Ten-pack of 150mm closed-loop GT2 6mm-wide rubber timing belts.',
  },
  {
    manufacturerSlug: 'uxcell',
    name: 'uxcell 15pcs 2GT Timing Belt Closed Loop 200-2GT-6 (6mm Width x 200mm Length)',
    sku: 'B0CZLSYD1W',
    imageUrl: PLACEHOLDER_IMAGE,
    category: 'belts',
    productUrl: 'https://www.amazon.com/uxcell-Timing-Closed-Rubber-Belts/dp/B0CZLSYD1W',
    description: 'Fifteen-pack of 200mm closed-loop GT2 6mm-wide rubber timing belts.',
  },
  {
    manufacturerSlug: 'uxcell',
    name: 'uxcell 6pcs 2GT Closed Loop Timing Belt Assorted (110/158/200/300/400/610mm, 6mm Width)',
    sku: 'B0CMT5YTFQ',
    imageUrl: PLACEHOLDER_IMAGE,
    category: 'belts',
    productUrl: 'https://www.amazon.com/uxcell-Closed-Timing-Assorted-Printer/dp/B0CMT5YTFQ',
    description: 'Assorted six-pack of closed-loop GT2 6mm-wide timing belts spanning 110mm to 610mm.',
  },
];
