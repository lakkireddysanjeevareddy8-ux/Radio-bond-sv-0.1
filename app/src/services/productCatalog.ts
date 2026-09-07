import { ImageSourcePropType } from 'react-native';

export interface ProductFeature {
  icon: string;
  title: string;
  description: string;
}

export interface ProductDefinition {
  id: string;
  name: string;
  model: string;
  category: 'Safety' | 'Radar' | 'Emergency';
  image: ImageSourcePropType;
  tagline: string;
  description: string;
  features: ProductFeature[];
  specs: {
    mcu: string;
    radarSensor: string;
    connectivity: string;
    detectionRange: string;
    operatingVoltage: string;
    responseTime: string;
  };
  bleServiceUuid: string;
  bleProvisionCharUuid: string;
  bleStatusCharUuid: string;
  firmwareFamily: string;
  defaultPort: number;
}

export const PRODUCT_CATALOG: ProductDefinition[] = [
  {
    id: 'wsg-01',
    name: 'Washroom Safety Gadget',
    model: 'WSG-01',
    category: 'Safety',
    image: require('../../assets/wsg01_product.jpg'),
    tagline: 'Non-invasive mmWave Presence & Stillness Detection',
    description:
      'Professional wall-mounted washroom safety monitor powered by ESP32-WROOM-32 and a 24GHz HLK-LD2410C millimeter-wave radar sensor. Provides privacy-first automated stillness detection, wellbeing chime checks, and instant audible emergency alarms.',
    features: [
      {
        icon: 'Eye',
        title: 'Presence Detection',
        description: 'High-precision 24GHz mmWave radar tracks human presence through steam, partitions, and curtains.',
      },
      {
        icon: 'Activity',
        title: 'Occupancy Monitoring',
        description: 'Accurately distinguishes between continuous micro-movements (breathing) and hazardous prolonged stillness.',
      },
      {
        icon: 'Bluetooth',
        title: 'Bluetooth Fast Setup',
        description: 'Direct BLE GATT handshake for one-tap Wi-Fi credential provisioning without manual network hopping.',
      },
      {
        icon: 'Wifi',
        title: 'Wi-Fi Connectivity',
        description: 'Dual local HTTP REST API on your local network alongside encrypted Supabase cloud telemetry synchronization.',
      },
      {
        icon: 'ShieldCheck',
        title: 'Real-time Safety Status',
        description: 'Instant local alarm buzzer and real-time dashboard updates if emergency response times out.',
      },
    ],
    specs: {
      mcu: 'Espressif ESP32-WROOM-32 (Dual Core 240MHz)',
      radarSensor: 'HLK-LD2410C 24GHz FMCW Radar Module',
      connectivity: '2.4GHz Wi-Fi (802.11 b/g/n) + BLE 4.2 / 5.0',
      detectionRange: '0.75m to 6.0m adjustable gate zones',
      operatingVoltage: '5V DC USB-C (500mA typical)',
      responseTime: '< 100ms micro-movement detection',
    },
    // Standard 128-bit UUIDs for WSG-01 SafeGuard
    bleServiceUuid: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
    bleProvisionCharUuid: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
    bleStatusCharUuid: 'beb5483e-36e1-4688-b7f5-ea07361b26a9',
    firmwareFamily: 'ESP32-LD2410C',
    defaultPort: 80,
  },
];

export class ProductCatalogService {
  public static getAllProducts(): ProductDefinition[] {
    return PRODUCT_CATALOG;
  }

  public static getProductById(id: string): ProductDefinition | undefined {
    return PRODUCT_CATALOG.find((p) => p.id === id);
  }

  public static getCompatibleProductsByServiceUuid(serviceUuid: string): ProductDefinition[] {
    const norm = serviceUuid.toLowerCase().replace(/[^a-f0-9]/g, '');
    return PRODUCT_CATALOG.filter(
      (p) => p.bleServiceUuid.toLowerCase().replace(/[^a-f0-9]/g, '') === norm
    );
  }
}
