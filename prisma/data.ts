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

export const standardParts: SeedPart[] = [
  // ── goBILDA ──────────────────────────────────────────────────────────
  {
    manufacturerSlug: 'gobilda',
    name: '5203 Series Yellow Jacket Planetary Gear Motor (19.2:1, 8mm REX, 312 RPM, 3.3-5V Encoder)',
    sku: '5203-2402-0019',
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
    category: 'servos',
    productUrl: 'https://www.gobilda.com/2000-series-dual-mode-servo-25-2-torque/',
    description:
      'Steel-geared 25-tooth-spline servo switchable between 300-degree positional and continuous-rotation modes; high-torque variant.',
  },
  {
    manufacturerSlug: 'gobilda',
    name: '2000 Series Dual Mode Servo (25-3, Speed)',
    sku: '2000-0025-0003',
    category: 'servos',
    productUrl: 'https://www.gobilda.com/2000-series-dual-mode-servo-25-3-speed/',
    description: 'The faster (~115 RPM at 6V) version of the 2000 Series dual-mode servo.',
  },
  {
    manufacturerSlug: 'gobilda',
    name: '96mm Mecanum Wheel Set (70A Durometer Bearing Supported Rollers)',
    sku: '3213-3606-0002',
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
    category: 'shaft-attachments',
    productUrl: 'https://www.gobilda.com/1309-series-sonic-hub-8mm-rex-bore/',
    description:
      'Balanced aluminum clamping hub with 8mm REX bore and 16mm bolt pattern, for mounting wheels/gears to REX shafting.',
  },
  {
    manufacturerSlug: 'gobilda',
    name: '1120 Series U-Channel (17 Hole, 432mm Length)',
    sku: '1120-0017-0432',
    category: 'hardware',
    productUrl: 'https://www.gobilda.com/1120-series-u-channel-17-hole-432mm-length/',
    description:
      'Clear-anodized aluminum U-channel, the foundational structural element of the goBILDA build system.',
  },
  {
    manufacturerSlug: 'gobilda',
    name: '8mm REX Shaft Starter Pack',
    sku: '3201-0008-0001',
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
    category: 'electronics',
    productUrl: 'https://www.revrobotics.com/rev-31-1595/',
    description:
      'All-in-one Android-based FTC robot controller with built-in Wi-Fi; the primary brain of a REV control system.',
  },
  {
    manufacturerSlug: 'rev',
    name: 'Expansion Hub',
    sku: 'REV-31-1153',
    category: 'electronics',
    productUrl: 'https://www.revrobotics.com/rev-31-1153/',
    description:
      'Adds motor, servo, and sensor ports to a Control Hub; same I/O as the Control Hub without wireless.',
  },
  {
    manufacturerSlug: 'rev',
    name: 'Driver Hub',
    sku: 'REV-31-1596',
    category: 'electronics',
    productUrl: 'https://www.revrobotics.com/rev-31-1596/',
    description:
      'Dedicated Android driver-station device for connecting gamepads and driving an FTC robot.',
  },
  {
    manufacturerSlug: 'rev',
    name: 'HD Hex Motor (40:1 Spur Gearbox)',
    sku: 'REV-41-1301',
    category: 'motors',
    productUrl: 'https://www.revrobotics.com/rev-41-1301/',
    description:
      'HD Hex brushed motor with 40:1 spur gearbox, integrated encoder, and 5mm hex output; ~150 RPM.',
  },
  {
    manufacturerSlug: 'rev',
    name: 'Core Hex Motor',
    sku: 'REV-41-1300',
    category: 'motors',
    productUrl: 'https://www.revrobotics.com/rev-41-1300/',
    description:
      'Compact geared motor with 5mm hex output and integrated encoder, popular for low-speed high-torque mechanisms.',
  },
  {
    manufacturerSlug: 'rev',
    name: 'Smart Robot Servo',
    sku: 'REV-41-1097',
    category: 'servos',
    productUrl: 'https://www.revrobotics.com/rev-41-1097/',
    description:
      'Configurable metal-geared 25T servo; standard 270-degree, custom-angle, or continuous rotation via the SRS programmer.',
  },
  {
    manufacturerSlug: 'rev',
    name: '15mm Extrusion - 1m - 90 Degree Ends',
    sku: 'REV-41-1017',
    category: 'hardware',
    productUrl: 'https://www.revrobotics.com/rev-41-1017/',
    description:
      "1-meter length of REV's 15mm square building-system extrusion that accepts standard M3 hardware.",
  },
  {
    manufacturerSlug: 'rev',
    name: '12V Slim Battery',
    sku: 'REV-31-1302',
    category: 'electronics',
    productUrl: 'https://www.revrobotics.com/rev-31-1302/',
    description:
      '10-cell 12V 3000mAh low-profile NiMH robot battery with XT30 connector and inline 20A fuse.',
  },

  // ── Axon Robotics ────────────────────────────────────────────────────
  {
    manufacturerSlug: 'axon',
    name: 'Axon MAX MK2',
    sku: null,
    category: 'servos',
    productUrl: 'https://axon-robotics.com/products/max',
    description:
      'Flagship high-performance brushless FTC servo with stainless steel gearbox and ~7.5W output; MK2 generation.',
  },
  {
    manufacturerSlug: 'axon',
    name: 'Axon MINI MK2',
    sku: null,
    category: 'servos',
    productUrl: 'https://axon-robotics.com/products/mini',
    description:
      'Compact brushless servo 10mm shorter than standard, same 7.5W output; common for claws, wrists, and pivots.',
  },
  {
    manufacturerSlug: 'axon',
    name: 'Axon MICRO+',
    sku: null,
    category: 'servos',
    productUrl: 'https://axon-robotics.com/products/micro',
    description:
      'Ultra-compact (~21g) brushless servo about 4x smaller than standard, for latches, light linkages, and claws.',
  },
  {
    manufacturerSlug: 'axon',
    name: 'Axon Servo Programmer',
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
    sku: null,
    category: 'electronics',
    productUrl: 'https://ferracomponents.com/products/16awg-xt30u-power-wire',
    description: 'Pre-made 16AWG power extension with XT30U connectors for FTC battery/power distribution.',
  },
  {
    manufacturerSlug: 'ferra',
    name: 'Parallel 20AWG Locking Servo Cable',
    sku: null,
    category: 'electronics',
    productUrl: 'https://ferracomponents.com/products/20awg-locking-servo-wire',
    description: 'Servo extension cable with locking connectors to prevent disconnects during competition.',
  },
  {
    manufacturerSlug: 'ferra',
    name: 'Sensor/Odometry Cable (JST-PH 4-pin Male to 4-pin Male)',
    sku: null,
    category: 'electronics',
    productUrl:
      'https://ferracomponents.com/products/encoder-cable-jst-ph-4-pin-male-to-4-pin-male',
    description: '4-pin JST-PH cable for connecting encoders/odometry pods and I2C sensors.',
  },
  {
    manufacturerSlug: 'ferra',
    name: 'XT30U Connectors (10 Pack)',
    sku: null,
    category: 'electronics',
    productUrl: 'https://ferracomponents.com/products/xt30-connectors-10-pack',
    description: 'Ten-pack of XT30U power connectors for DIY FTC power cabling.',
  },
  {
    manufacturerSlug: 'ferra',
    name: 'Silicone Driver Hub Case',
    sku: null,
    category: 'misc',
    productUrl: 'https://ferracomponents.com/products/silicone-driver-hub-case',
    description: 'Protective silicone case for the REV Driver Hub.',
  },
  {
    manufacturerSlug: 'ferra',
    name: '48mm Vector Wheel Rollers V2',
    sku: null,
    category: 'wheels',
    productUrl: 'https://ferracomponents.com/products/48mm-vector-wheel-rollers-v2',
    description: 'Replacement rollers for 48mm vector/omni wheels.',
  },

  // ── MelonBotics ──────────────────────────────────────────────────────
  {
    manufacturerSlug: 'melonbotics',
    name: 'Super Servo Plus',
    sku: null,
    category: 'servos',
    productUrl: 'https://www.melonbotics.com/products/super-servo-plus',
    description: 'High-speed (~1000 RPM) continuous-rotation servo for lightweight, fast intakes and outtakes.',
  },
  {
    manufacturerSlug: 'melonbotics',
    name: 'Magnum',
    sku: null,
    category: 'motors',
    productUrl: 'https://www.melonbotics.com/products/magnum',
    description:
      'Brushless 550-size servo that is a drop-in replacement for 550-class motors (HD Hex, NeveRest, etc.).',
  },
  {
    manufacturerSlug: 'melonbotics',
    name: 'Encoder',
    sku: null,
    category: 'electronics',
    productUrl: 'https://www.melonbotics.com/products/encoder',
    description: 'Magnetic rotary encoder for odometry and shaft position sensing.',
  },
  {
    manufacturerSlug: 'melonbotics',
    name: 'Nano Encoder',
    sku: null,
    category: 'electronics',
    productUrl: 'https://www.melonbotics.com/products/nano-encoder',
    description: 'Miniature magnetic encoder for compact odometry/position-feedback applications.',
  },
  {
    manufacturerSlug: 'melonbotics',
    name: 'Thin Section Bearings',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.melonbotics.com/products/thin-section-bearings',
    description: 'Low-profile thin-section ball bearings for weight- and space-constrained mechanisms.',
  },
  {
    manufacturerSlug: 'melonbotics',
    name: 'PWM Extension Cables',
    sku: null,
    category: 'electronics',
    productUrl: 'https://www.melonbotics.com/products/pwm-extension-cables',
    description: 'Servo/PWM extension cables for routing signal on FTC robots.',
  },

  // ── Offset Robotics ──────────────────────────────────────────────────
  {
    manufacturerSlug: 'offsetrobotics',
    name: 'Threaded Square Beam Bundle (64 pack)',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.offsetrobotics.com/product/threaded-square-beam-bundle/',
    description: 'Bundle of 64 CNC-machined threaded square beams for lightweight structural framing.',
  },
  {
    manufacturerSlug: 'offsetrobotics',
    name: '4 Hole Threaded Square Beam',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.offsetrobotics.com/product/4-hole-threaded-square-beam/',
    description: 'Single 4-hole threaded square structural beam.',
  },
  {
    manufacturerSlug: 'offsetrobotics',
    name: 'Angled Mounting Block Bundle (56 pack)',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.offsetrobotics.com/product/angled-mounting-block-bundle/',
    description: 'Assortment of 56 angled gusset/mounting blocks for joining structure at angles.',
  },
  {
    manufacturerSlug: 'offsetrobotics',
    name: '45 Degree Mounting Block',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.offsetrobotics.com/product/45-degree-mounting-block/',
    description: '45-degree machined gusset block for angled structural connections.',
  },
  {
    manufacturerSlug: 'offsetrobotics',
    name: 'Ultimate Box Tube Kit (Combo Deal)',
    sku: null,
    category: 'motion',
    productUrl: 'https://www.offsetrobotics.com/product/combo-deal-ultimate-box-tube-kit/',
    description:
      'Combo of box-tube telescoping linear-slide stages and spare hardware for multi-stage lifts.',
  },
  {
    manufacturerSlug: 'offsetrobotics',
    name: 'Offset Robotics Mounting Block',
    sku: null,
    category: 'hardware',
    productUrl: 'https://www.offsetrobotics.com/product/offset-robotics-mounting-block/',
    description: 'General-purpose machined mounting block for the Offset structure system.',
  },

  // ── MATA Robotics ────────────────────────────────────────────────────
  {
    manufacturerSlug: 'mata',
    name: 'MATA Torque Servo',
    sku: null,
    category: 'servos',
    productUrl: 'https://www.matarobotics.net/products/mata-torque-servo',
    description: 'High-torque FTC servo engineered and tested by an FTC team.',
  },
  {
    manufacturerSlug: 'mata',
    name: 'MATA Speed Servo',
    sku: null,
    category: 'servos',
    productUrl:
      'https://www.matarobotics.net/products/mata-micro-servo-beta-preorder-limited-release',
    description: "High-speed variant of MATA's competition servo line.",
  },
  {
    manufacturerSlug: 'mata',
    name: 'MATA Torque V2',
    sku: null,
    category: 'servos',
    productUrl: 'https://www.matarobotics.net/products/mata-torque-v2-beta-pre-order-phase',
    description: 'Second-generation MATA high-torque servo (beta/pre-order).',
  },
  {
    manufacturerSlug: 'mata',
    name: 'Servo Programmer',
    sku: null,
    category: 'electronics',
    productUrl: 'https://www.matarobotics.net/products/servo-programmer',
    description: 'Programmer for configuring MATA programmable servos.',
  },
  {
    manufacturerSlug: 'mata',
    name: 'MATA Pro Servo Extension Cable (Shielded, Braided, FTC Legal)',
    sku: null,
    category: 'electronics',
    productUrl:
      'https://www.matarobotics.net/products/mata-pro-servo-extension-cable-shielded-braided-ftc-legal',
    description: 'Shielded, braided FTC-legal servo extension cable for noise-resistant signal runs.',
  },
  {
    manufacturerSlug: 'mata',
    name: '16T GT2 Pulleys',
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
    category: 'belts',
    productUrl: 'https://www.amazon.com/uxcell-Timing-Closed-Rubber-Belts/dp/B0CTKGLQ9N',
    description: 'Ten-pack of 96mm closed-loop 2mm-pitch (GT2) 6mm-wide rubber timing belts.',
  },
  {
    manufacturerSlug: 'uxcell',
    name: 'uxcell 10pcs 2GT Timing Belt Closed Loop 150-2GT-6 (6mm Width x 150mm Length)',
    sku: 'B0CM6M1MYM',
    category: 'belts',
    productUrl: 'https://www.amazon.com/uxcell-Timing-Closed-150-2GT-6-Printer/dp/B0CM6M1MYM',
    description: 'Ten-pack of 150mm closed-loop GT2 6mm-wide rubber timing belts.',
  },
  {
    manufacturerSlug: 'uxcell',
    name: 'uxcell 15pcs 2GT Timing Belt Closed Loop 200-2GT-6 (6mm Width x 200mm Length)',
    sku: 'B0CZLSYD1W',
    category: 'belts',
    productUrl: 'https://www.amazon.com/uxcell-Timing-Closed-Rubber-Belts/dp/B0CZLSYD1W',
    description: 'Fifteen-pack of 200mm closed-loop GT2 6mm-wide rubber timing belts.',
  },
  {
    manufacturerSlug: 'uxcell',
    name: 'uxcell 6pcs 2GT Closed Loop Timing Belt Assorted (110/158/200/300/400/610mm, 6mm Width)',
    sku: 'B0CMT5YTFQ',
    category: 'belts',
    productUrl: 'https://www.amazon.com/uxcell-Closed-Timing-Assorted-Printer/dp/B0CMT5YTFQ',
    description: 'Assorted six-pack of closed-loop GT2 6mm-wide timing belts spanning 110mm to 610mm.',
  },
];
