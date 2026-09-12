import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/errors";
import { connectToDatabase } from "@/server/db";
import { UserModel } from "@/server/models/user";
const registerSchema = z.object({ name: z.string().trim().max(120).optional(), email: z.string().email(), password: z.string().min(8, "Password must be at least 8 characters") });
export async function POST(request: Request) {
	try {
		const form = await request.formData();
		const input = registerSchema.parse({
			name: String(form.get("name") ?? "").trim() || undefined,
			email: String(form.get("email") ?? ""),
			password: String(form.get("password") ?? "")
		});

		try {
			await connectToDatabase();
		} catch (err) {
			throw new AppError("Unable to connect to database", 503, { code: "DB_UNAVAILABLE", details: { message: String((err as Error)?.message ?? err) } });
		}

		const exists = await UserModel.exists({ email: input.email.toLowerCase() });
		if (exists) throw new AppError("An account with this email already exists", 409);

		await UserModel.create({
			name: input.name,
			email: input.email.toLowerCase(),
			passwordHash: await bcrypt.hash(input.password, 12)
		});

		return NextResponse.json({ ok: true }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
