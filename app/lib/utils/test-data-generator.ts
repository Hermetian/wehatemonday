import { v4 as uuidv4 } from 'uuid';
import { UserClade } from '@/lib/supabase/types';

export interface WeightedItem<T> {
  value: T;
  weight: number;
}

export interface TestUserConfig {
  userCount?: number;
  email?: WeightedItem<string>[];
  name?: WeightedItem<string>[];
  clade?: WeightedItem<UserClade>[];
  creationTime?: Date;
  duration?: number;
  flags?: WeightedItem<string>[][];
}

export function generateRandomEmail(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const randomString = Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  const domains = ['test.com', 'example.com', 'demo.org'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const timestamp = Date.now();
  return `test.${randomString}.${timestamp}@${domain}`;
}

export function selectWeighted<T>(items: WeightedItem<T>[]): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) {
      return item.value;
    }
  }
  
  return items[0].value; // Fallback
}

export function generateBatchToken(): string {
  return `test_${uuidv4()}`;
}

export function generateTestUserData(config: TestUserConfig) {
  const {
    userCount = 1,
    email,
    name,
    clade,
    creationTime = new Date(),
    duration = 24,
    flags = []
  } = config;

  const batchId = generateBatchToken();
  const cleanupAt = new Date(creationTime.getTime() + duration * 60 * 60 * 1000);

  return Array.from({ length: userCount }, (_, index) => {
    let emailValue: string;
    if (email && email.length > 0) {
      // If custom email pattern provided, make it unique with index and timestamp
      const baseEmail = selectWeighted(email);
      const [localPart, domain] = baseEmail.split('@');
      emailValue = `${localPart}.test${index}.${Date.now()}@${domain}`;
    } else {
      emailValue = generateRandomEmail();
    }

    return {
      email: emailValue,
      name: name ? selectWeighted(name) : `Test User ${index + 1}`,
      clade: clade ? selectWeighted(clade) : UserClade.CUSTOMER,
      metadata: {
        isTest: true,
        batchId,
        flags: flags.map(flagGroup => 
          flagGroup.length ? selectWeighted(flagGroup) : null
        ).filter(Boolean)
      },
      testBatchId: batchId,
      cleanupAt,
      createdAt: creationTime,
      updatedAt: creationTime
    };
  });
} 