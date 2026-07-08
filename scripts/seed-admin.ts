import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/server/db";
import { UserModel } from "@/server/models/user";
async function main() { const email = process.env.SEED_ADMIN_EMAIL; const password = process.env.SEED_ADMIN_PASSWORD; const name = process.env.SEED_ADMIN_NAME ?? "Development Admin"; if (!email || !password) throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required"); await connectToDatabase(); await UserModel.findOneAndUpdate({ email: email.toLowerCase() }, { name, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12) }, { upsert: true, new: true, setDefaultsOnInsert: true }); console.log(`Seeded admin user: ${email}`); }
main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
