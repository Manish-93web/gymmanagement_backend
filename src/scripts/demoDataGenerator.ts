// Shared helpers & constant pools used by demo seed scripts

export const FIRST_NAMES = ['Rahul','Priya','Amit','Sneha','Vikram','Ananya','Rohit','Kavya','Arjun','Divya','Kiran','Meera','Suresh','Pooja','Nikhil','Riya','Sanjay','Nisha','Deepak','Anjali','Arun','Sunita','Mohan','Geeta','Ravi','Shweta','Manish','Rekha','Varun','Seema','Anil','Smita','Gaurav','Kavita','Sachin','Anju','Tarun','Poonam','Harish','Radhika','Vikas','Preeti','Naresh','Vandana','Saurabh','Neelam','Yogesh','Archana','Sandeep','Shilpa'];
export const LAST_NAMES  = ['Sharma','Patel','Gupta','Singh','Kumar','Verma','Shah','Mehta','Joshi','Nair','Reddy','Iyer','Rao','Pillai','Chopra','Malhotra','Agarwal','Srivastava','Mishra','Tiwari','Pandey','Chauhan','Saxena','Bose','Das','Chatterjee','Banerjee','Mukherjee','Khanna','Kapoor'];
export const CITIES      = ['Delhi','Mumbai','Bangalore','Hyderabad','Chennai','Pune','Kolkata','Ahmedabad','Jaipur','Lucknow','Noida','Gurgaon','Chandigarh','Indore','Bhopal'];
export const GOALS       = ['Weight Loss','Muscle Gain','Endurance','Flexibility','General Fitness','Athletic Performance','Stress Relief','Body Toning'];
export const BLOOD_GROUPS= ['A+','A-','B+','B-','O+','O-','AB+','AB-'];
export const PLAN_NAMES  = ['Basic Monthly','Pro Quarterly','Elite Annual','PT Premium','Half Yearly','Student Pack'];

export const TRAINER_DEFS = [
    { firstName: 'Rahul',  lastName: 'Sharma', specs: ['Strength Training','CrossFit','Powerlifting'], years: 7, rating: 4.8, mobile: '9811001001' },
    { firstName: 'Aman',   lastName: 'Verma',  specs: ['Yoga','Pilates','Flexibility'],               years: 5, rating: 4.9, mobile: '9811001002' },
    { firstName: 'Neha',   lastName: 'Singh',  specs: ['Zumba','Dance Fitness','Cardio'],              years: 4, rating: 4.7, mobile: '9811001003' },
    { firstName: 'Priya',  lastName: 'Yadav',  specs: ['HIIT','Functional Training','Kickboxing'],     years: 6, rating: 4.8, mobile: '9811001004' },
    { firstName: 'Karan',  lastName: 'Malik',  specs: ['Bodybuilding','Nutrition','Weight Loss'],      years: 9, rating: 4.9, mobile: '9811001005' },
    { firstName: 'Deepak', lastName: 'Rana',   specs: ['CrossFit','Cardio','Endurance'],               years: 5, rating: 4.6, mobile: '9811001006' },
];

export const CLASS_DEFS = [
    { name: 'Power Yoga',        category: 'yoga',         level: 'all',          duration: 60, capacity: 20, time: '07:00', days: ['monday','wednesday','friday'] },
    { name: 'Zumba Party',       category: 'zumba',        level: 'all',          duration: 45, capacity: 25, time: '18:00', days: ['tuesday','thursday','saturday'] },
    { name: 'CrossFit WOD',      category: 'crossfit',     level: 'intermediate', duration: 60, capacity: 15, time: '06:00', days: ['monday','tuesday','wednesday','thursday','friday'] },
    { name: 'HIIT Blast',        category: 'hiit',         level: 'advanced',     duration: 45, capacity: 18, time: '19:00', days: ['monday','wednesday','friday'] },
    { name: 'Strength Mastery',  category: 'strength',     level: 'intermediate', duration: 75, capacity: 12, time: '10:00', days: ['tuesday','thursday','saturday'] },
    { name: 'Cardio Burn',       category: 'cardio',       level: 'beginner',     duration: 45, capacity: 20, time: '08:00', days: ['monday','wednesday','friday','saturday'] },
];

export const LEAD_SOURCES = ['social_media','walk_in','referral','advertisement','website','event','other'];
export const LEAD_STAGES  = ['new','contacted','qualified','proposal','converted','lost'];

export const PRODUCT_DEFS = [
    { name: 'Whey Protein (1kg)',    category: 'supplement', cost: 1200, price: 1999, stock: 45 },
    { name: 'BCAA Powder (300g)',    category: 'supplement', cost: 600,  price: 999,  stock: 30 },
    { name: 'Shaker Bottle 700ml',   category: 'accessory',  cost: 150,  price: 349,  stock: 60 },
    { name: 'Gym Gloves (pair)',      category: 'accessory',  cost: 200,  price: 449,  stock: 40 },
    { name: 'Resistance Band Set',   category: 'accessory',  cost: 300,  price: 699,  stock: 25 },
    { name: 'Yoga Mat Premium',      category: 'equipment',  cost: 500,  price: 1099, stock: 15 },
    { name: 'Creatine Monohydrate',  category: 'supplement', cost: 400,  price: 799,  stock: 20 },
    { name: 'Pre-Workout (250g)',     category: 'supplement', cost: 700,  price: 1299, stock: 18 },
    { name: 'Gym Bag Large',         category: 'accessory',  cost: 600,  price: 1499, stock: 12 },
    { name: 'Foam Roller',           category: 'equipment',  cost: 400,  price: 899,  stock: 8  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] as T; }
export function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function daysAgo(n: number): Date { return new Date(Date.now() - n * 86_400_000); }
export function daysFromNow(n: number): Date { return new Date(Date.now() + n * 86_400_000); }
export function monthsAgo(n: number): Date { const d = new Date(); d.setMonth(d.getMonth() - n); return d; }
export function monthsFromNow(n: number): Date { const d = new Date(); d.setMonth(d.getMonth() + n); return d; }
export function nanoid(len = 8): string { return Math.random().toString(36).substring(2, 2 + len).toUpperCase(); }
export function randomMobile(): string { return `9${randInt(600000000, 999999999)}`; }
export function randomInvoiceNo(): string { return `INV-${Date.now().toString(36).toUpperCase()}-${nanoid(4)}`; }

export function peakHourWeight(hour: number): number {
    if (hour >= 6  && hour <= 9)  return 4;
    if (hour >= 17 && hour <= 21) return 5;
    if (hour >= 10 && hour <= 12) return 2;
    if (hour >= 14 && hour <= 16) return 2;
    return 1;
}

export function randomCheckInTime(baseDate: Date): Date {
    const d = new Date(baseDate);
    const hours: number[] = [];
    for (let h = 5; h <= 22; h++) {
        const w = peakHourWeight(h);
        for (let i = 0; i < w; i++) hours.push(h);
    }
    const hour = rand(hours);
    d.setHours(hour, randInt(0, 59), randInt(0, 59), 0);
    return d;
}
