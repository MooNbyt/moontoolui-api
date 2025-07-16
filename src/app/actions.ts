'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import fs from 'fs/promises'
import path from 'path'
import JSZip from 'jszip'
import {addDays, formatISO} from 'date-fns'
import clientPromise from '@/lib/mongodb'
import { Collection, ObjectId } from 'mongodb'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import type { User } from '@/app/page'

export type State = {
  message?: string
}
export type UserState = {
  message?: string;
  success?: boolean;
}
export type PriceState = {
  message?: string;
  success?: boolean;
}

// --- DB Helpers ---
async function getKeysCollection(): Promise<Collection> {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB_NAME || 'gatekeeper';
  const db = client.db(dbName);
  return db.collection('keys');
}

async function getUsersCollection(): Promise<Collection> {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB_NAME || 'gatekeeper';
  const db = client.db(dbName);
  return db.collection('users');
}

async function getPricesCollection(): Promise<Collection> {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB_NAME || 'gatekeeper';
  const db = client.db(dbName);
  return db.collection('prices');
}

// --- Time Helper ---
async function getMoscowTime(): Promise<Date> {
  try {
    const timeApiUrl = process.env.TIME_API_URL || 'http://worldtimeapi.org/api/timezone/Europe/Moscow';
    const response = await fetch(timeApiUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to fetch time: ${response.statusText}`);
    }
    const data = await response.json();
    return new Date(data.utc_datetime);
  } catch (error) {
    console.error("Could not fetch Moscow time, falling back to server time.", error);
    // Fallback to server time if the API fails
    return new Date();
  }
}

// --- Auth Actions ---
export async function login(
  prevState: State | undefined,
  formData: FormData
): Promise<State> {
  const username = formData.get('username') as string
  const password = formData.get('password') as string

  // 1. Check for Super Admin
  const appUsername = process.env.APP_USERNAME || 'admin'
  const appPassword = process.env.APP_PASSWORD || 'password'

  if (username === appUsername && password === appPassword) {
    const sessionData = JSON.stringify({ loggedIn: true, role: 'admin', username: appUsername });
    cookies().set('auth_session', sessionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    })
    redirect('/')
  }

  // 2. Check for Moderator
  const usersCollection = await getUsersCollection();
  const moderator = await usersCollection.findOne({ username });

  if (moderator && (await bcrypt.compare(password, moderator.password))) {
     const sessionData = JSON.stringify({ loggedIn: true, role: moderator.role, username: moderator.username, userId: moderator._id.toString() });
     cookies().set('auth_session', sessionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    })
    redirect('/')
  }

  return { message: 'Login failed. Please check your credentials.' }
}

export async function logout() {
  cookies().delete('auth_session')
  redirect('/')
}

// --- User (Moderator) Management ---
export async function createModerator(prevState: UserState | undefined, formData: FormData): Promise<UserState> {
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!username || !password) {
        return { message: 'Username and password are required.' };
    }

    try {
        const usersCollection = await getUsersCollection();
        const existingUser = await usersCollection.findOne({ username });

        if (existingUser) {
            return { message: 'Moderator with this username already exists.' };
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await usersCollection.insertOne({
            username,
            password: hashedPassword,
            role: 'moderator',
            debt: 0,
            createdAt: new Date(),
        });

        return { success: true, message: `Moderator "${username}" created successfully.` };
    } catch (error) {
        console.error('Error creating moderator:', error);
        return { message: 'An error occurred while creating the moderator.' };
    }
}

export async function getModerators() {
    const usersCollection = await getUsersCollection();
    const moderators = await usersCollection.find({ role: 'moderator' }).sort({ createdAt: -1 }).toArray();
    return moderators.map(doc => ({
        _id: doc._id.toString(),
        username: doc.username,
        debt: doc.debt || 0,
        createdAt: doc.createdAt.toISOString(),
    }));
}

export async function getModerator(userId: string) {
    if (!userId) return null;
    const usersCollection = await getUsersCollection();
    const moderator = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!moderator) return null;
    return {
        _id: moderator._id.toString(),
        username: moderator.username,
        debt: moderator.debt || 0,
        createdAt: moderator.createdAt.toISOString(),
    };
}


export async function deleteModerator(id: string) {
    const usersCollection = await getUsersCollection();
    const keysCollection = await getKeysCollection();
    
    // Find the moderator to get their username
    const moderatorToDelete = await usersCollection.findOne({ _id: new ObjectId(id) });
    if (!moderatorToDelete) {
        return { success: false, message: 'Moderator not found.' };
    }

    // Delete all keys created by this moderator
    await keysCollection.deleteMany({ createdBy: moderatorToDelete.username });

    // Delete the moderator
    const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
        return { success: true, message: `Moderator "${moderatorToDelete.username}" and all their keys have been deleted.` };
    }
    return { success: false, message: 'Failed to delete moderator after cleaning up keys.' };
}

export async function clearModeratorDebt(id: string) {
    const usersCollection = await getUsersCollection();
    const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { debt: 0 } }
    );
    if (result.modifiedCount === 1) {
        return { success: true, message: 'Debt cleared successfully.' };
    }
    return { success: false, message: 'Failed to clear debt.' };
}

// --- Price Management ---
export async function getPrices() {
    const pricesCollection = await getPricesCollection();
    const prices = await pricesCollection.find({}).toArray();
    return prices.map(p => ({_id: p._id.toString(), validityDays: p.validityDays, price: p.price }));
}


export async function updateAllPrices(prevState: PriceState | undefined, formData: FormData): Promise<PriceState> {
    try {
        const pricesCollection = await getPricesCollection();
        const operations = [];

        for (const [key, value] of formData.entries()) {
            if (key.startsWith('price-')) {
                const validityDays = parseInt(key.split('-')[1], 10);
                const price = parseFloat(value as string);
                
                if (isNaN(validityDays) || isNaN(price) || price < 0) {
                   console.warn(`Skipping invalid price data: ${key}=${value}`);
                   continue;
                }
                
                operations.push({
                    updateOne: {
                        filter: { validityDays: validityDays },
                        update: { $set: { price: price } },
                        upsert: true
                    }
                });
            }
        }
        
        if (operations.length > 0) {
            await pricesCollection.bulkWrite(operations);
        }

        return { success: true, message: `Prices updated successfully.` };
    } catch (error) {
        console.error('Error updating prices:', error);
        return { success: false, message: 'Database error while updating prices.' };
    }
}


// --- Key Management Actions ---
export async function generateKeys(prefix: string, count: number, validityDays: number, user: User) {
  const keysCollection = await getKeysCollection();
  const usersCollection = await getUsersCollection();
  const pricesCollection = await getPricesCollection();
  const newKeysForFile = [];
  const keysToInsert = [];

  let price = 0;
  if (user.role === 'moderator') {
    const priceDoc = await pricesCollection.findOne({ validityDays });
    price = priceDoc ? priceDoc.price : 0;
    const totalCost = count * price;
    if (user.userId) {
       await usersCollection.updateOne({ _id: new ObjectId(user.userId) }, { $inc: { debt: totalCost } });
    }
  }

  for (let i = 0; i < count; i++) {
    const randomPart = randomBytes(16).toString('hex').toUpperCase();
    const key = `${prefix}-${randomPart}`;
    keysToInsert.push({
      key,
      prefix,
      validityDays,
      price: user.role === 'moderator' ? price : 0,
      expires: null,
      activationDate: null,
      isActive: false,
      createdAt: new Date(),
      createdBy: user.username,
    });
    newKeysForFile.push({ key, validityDays, price: user.role === 'moderator' ? price : 0 });
  }

  await keysCollection.insertMany(keysToInsert);

  return { keys: newKeysForFile };
}

export async function getKeys(user: User) {
  const keysCollection = await getKeysCollection();
  
  const query = user.role === 'admin' ? {} : { createdBy: user.username };

  const keys = await keysCollection.find(query).sort({ createdAt: -1 }).toArray();
  // Convert ObjectId to string for client-side usage
  return keys.map(doc => ({
    ...doc,
    _id: doc._id.toString(), // Convert ObjectId to string
    createdAt: doc.createdAt.toISOString(), // Convert Date to string
  }));
}

export async function deleteKey(key: string) {
    const keysCollection = await getKeysCollection();
    const result = await keysCollection.deleteOne({ key: key });

    if (result.deletedCount === 1) {
        return { success: true, message: `Key ${key} deleted.` };
    }
    return { success: false, message: 'Key not found.' };
}

export async function deleteKeysByPrefix(prefix: string) {
    const keysCollection = await getKeysCollection();
    const result = await keysCollection.deleteMany({ prefix: prefix });
    
    return { success: true, message: `${result.deletedCount} keys with prefix "${prefix}" deleted.` };
}

// --- Project Download Action ---
async function readFiles(dir: string, zip: JSZip, root: string) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name);
    if (['node_modules', '.next', '.git'].includes(dirent.name)) {
      continue;
    }
    const relativePath = path.relative(root, fullPath);
    if (dirent.isDirectory()) {
      await readFiles(fullPath, zip, root);
    } else {
      const content = await fs.readFile(fullPath);
      zip.file(relativePath, content);
    }
  }
}

export async function downloadProject() {
  const zip = new JSZip();
  const projectRoot = process.cwd();
  
  await readFiles(projectRoot, zip, projectRoot);

  const zipAsBase64 = await zip.generateAsync({ type: "base64" });

  return {
    success: true,
    file: zipAsBase64,
    fileName: `project-backup-${new Date().toISOString().split('T')[0]}.zip`
  };
}

// --- API Functions ---
export async function activateKey(key: string) {
  const keysCollection = await getKeysCollection();
  const keyData = await keysCollection.findOne({ key: key });
  
  if (!keyData) {
    return { success: false, message: 'Key not found.' };
  }
  if (keyData.isActive) {
    return { success: false, message: 'Key already activated.' };
  }

  const now = await getMoscowTime();
  const activationDateStr = formatISO(now, { representation: 'date' });
  const validity = keyData.validityDays >= 36500 ? 36500 : keyData.validityDays;
  const expirationDate = addDays(now, validity);
  const expiresStr = formatISO(expirationDate, { representation: 'date' });

  await keysCollection.updateOne(
    { key: key },
    {
      $set: {
        isActive: true,
        activationDate: activationDateStr,
        expires: expiresStr
      }
    }
  );

  return { success: true, message: 'Key activated successfully.', expires: expiresStr };
}

export async function verifyKey(key: string) {
  const keysCollection = await getKeysCollection();
  const keyData = await keysCollection.findOne({ key: key });

  if (!keyData) {
    return { valid: false, message: 'Key not found.' };
  }
  if (!keyData.isActive || !keyData.expires) {
    return { valid: false, message: 'Key not activated.' };
  }

  const now = await getMoscowTime();
  const expirationDate = new Date(keyData.expires);

  if (now > expirationDate) {
    return { valid: false, message: 'Key has expired.' };
  }

  return { valid: true, message: 'Key is active.', expires: keyData.expires };
}
