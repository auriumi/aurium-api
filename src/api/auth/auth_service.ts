import prisma from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const jwt_sauce = process.env.JWT_SAUCE;
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

function getTurnstileSecret() {
    if (process.env.TURNSTILE_SECRET_KEY) {
        return process.env.TURNSTILE_SECRET_KEY;
    }

    if (process.env.NODE_ENV !== "production") {
        return TURNSTILE_TEST_SECRET;
    }

    return null;
}

export async function verifyCaptcha(token: string): Promise<boolean> {
    const secret = getTurnstileSecret();

    if (!secret) {
        console.error("TURNSTILE_SECRET_KEY is missing.");
        return false;
    }

    if (process.env.NODE_ENV !== "production" && secret === TURNSTILE_TEST_SECRET) {
        return true;
    }

    const params = new URLSearchParams({
        secret,
        response: token,
    });

    try {
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            body: params,
        });

        const data = await res.json() as { success: boolean };
        return data.success;
    } catch (err) {
        console.error("CAPTCHA verification request failed:", err);
        return false;
    }
}

export async function handleLogin(id: string, pass: string, is_admin?: boolean) {

    if (is_admin) {
        const admin = await prisma.admin.findUnique({
            where: {
                email: id
            }
        });

        if (!admin) {
            return {
                success: false,
                reason: "Invalid credentials!"
            };
        }

        const hash = admin.hashed_password;
        const isMatch = await bcrypt.compare(pass, hash);
        
        if (isMatch) {
            await prisma.admin.update({
                where: {
                    email: id
                },
                data: {
                    last_login: new Date()
                }
            });
            return { success: true, admin };
        }
        return { 
            success: false,
            reason: "Invalid credentials!"
        }

    } else {
        const student = await prisma.studentAuth.findUnique({
            where: {
                student_number: parseInt(id)
            },
        });

        if (!student) {
            return {
                success: false,
                reason: "Invalid credentials!"
            };
        }
        
        const student_is_new = student.is_new;
        const hash = student.hashed_password;

        if (!hash) {
            return {
                success: false,
                reason: "Invalid credentials!"
                //reason: "You're not verified yet, please wait for confirmation!"
            }
        }

        const isMatch = await bcrypt.compare(pass, hash);
        if (isMatch) {
            await prisma.studentAuth.update({
                where: {
                    student_number: parseInt(id)
                },
                data: {
                    last_login: new Date()
                }
            });
            return { 
                success: true,
                is_new: student_is_new
            };
        }

        return {
            success: false,
            reason: "Invalid credentials!"
        }
    }
}

export async function jwtGen(user: object) {
    const token = jwt.sign(user, jwt_sauce as string, { expiresIn: '1h' });
    return token;
}

export async function updatePassById(student_number: string, new_pass: string) {
    const hashed_pass = await bcrypt.hash(new_pass, 10);

    try {
        await prisma.studentAuth.update({
            where: {
                student_number: parseInt(student_number),
            },
            data: {
                hashed_password: hashed_pass,
                is_new: false
            }
        });    

        return { success: true }
    } catch (err) {
        console.error(err);
        return {
            success: false,
            reason: "Something went wrong in the server, please try again later."
        }
    }
}
