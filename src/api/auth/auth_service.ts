import prisma from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import 'dotenv/config';

const jwt_sauce = process.env.JWT_SAUCE;
const resend = new Resend(process.env.RESEND_API);
const MAIL_DOMAIN = "auriumi.cloud";
const PASSWORD_RESET_PURPOSE = "student_password_reset";
const PASSWORD_RESET_EXPIRY = "20m";

function getPasswordResetBaseUrl() {
    return (
        process.env.PASSWORD_RESET_BASE_URL ||
        process.env.FRONTEND_URL ||
        process.env.APP_URL ||
        "https://aurium-yearbook.site"
    ).replace(/\/$/, "");
}

function validatePassword(password: string) {
    return typeof password === "string" && password.length >= 8;
}


export async function verifyCaptcha(token: string): Promise<boolean> {
    const secret = process.env.NODE_ENV === "development"
        ? "1x0000000000000000000000000000000AA"
        : process.env.TURNSTILE_SECRET_KEY!;

    const params = new URLSearchParams({
        secret,
        response: token,
    });

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: params,
    });

    const data = await res.json() as { success: boolean };
    return data.success;
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

async function sendPasswordResetEmail(recipient: string, resetLink: string) {
    const { error } = await resend.emails.send({
        from: `Aurium <noreply@${MAIL_DOMAIN}>`,
        to: recipient,
        subject: "Reset your AURIUM password",
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#292524;max-width:560px;margin:0 auto;padding:24px">
                <h2 style="color:#78350f;margin-bottom:8px">Reset your AURIUM password</h2>
                <p>We received a request to reset your AURIUM Yearbook Portal password.</p>
                <p>Click the button below to set a new password. This link expires in 20 minutes.</p>
                <p style="margin:28px 0">
                    <a href="${resetLink}" style="background:#7a3b1a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
                        Reset Password
                    </a>
                </p>
                <p>If the button does not work, copy and paste this link into your browser:</p>
                <p style="word-break:break-all;color:#57534e">${resetLink}</p>
                <p style="font-size:13px;color:#78716c;margin-top:24px">If you did not request this, you can ignore this email. Your password will stay the same.</p>
            </div>
        `,
        text: `Reset your AURIUM password using this link: ${resetLink}\n\nThis link expires in 20 minutes. If you did not request this, ignore this email.`,
    });

    return !error;
}

export async function requestPasswordReset(identifier: string) {
    const trimmedIdentifier = String(identifier ?? "").trim();
    if (!trimmedIdentifier) return { success: true };

    try {
        const isStudentNumber = /^\d+$/.test(trimmedIdentifier);
        const normalizedEmail = trimmedIdentifier.toLowerCase();
        const student = await prisma.student.findFirst({
            where: {
                OR: [
                    ...(isStudentNumber ? [{ student_number: parseInt(trimmedIdentifier) }] : []),
                    { school_email: { equals: trimmedIdentifier, mode: "insensitive" } },
                    { personal_email: { equals: trimmedIdentifier, mode: "insensitive" } },
                ],
            },
            select: {
                student_number: true,
                school_email: true,
                personal_email: true,
                studentAuth: {
                    select: {
                        hashed_password: true,
                    },
                },
            },
        });

        if (!student?.studentAuth?.hashed_password) {
            return { success: true };
        }

        const schoolEmail = student.school_email?.trim();
        const personalEmail = student.personal_email?.trim();
        const matchingSubmittedEmail = [schoolEmail, personalEmail]
            .filter(Boolean)
            .find((email) => email!.toLowerCase() === normalizedEmail);
        const targetEmail = matchingSubmittedEmail || schoolEmail || personalEmail;

        if (!targetEmail) {
            return { success: true };
        }

        const resetToken = jwt.sign(
            {
                purpose: PASSWORD_RESET_PURPOSE,
                student_number: student.student_number,
                hash_marker: student.studentAuth.hashed_password,
            },
            jwt_sauce as string,
            { expiresIn: PASSWORD_RESET_EXPIRY }
        );

        const resetLink = `${getPasswordResetBaseUrl()}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
        const sent = await sendPasswordResetEmail(targetEmail, resetLink);

        if (!sent) {
            console.error(`Failed to send password reset email for student ${student.student_number}`);
        }

        return { success: true };
    } catch (err) {
        console.error("Password reset request failed:", err);
        return { success: true };
    }
}

export async function resetPasswordWithToken(token: string, new_pass: string) {
    if (!validatePassword(new_pass)) {
        return {
            success: false,
            reason: "Password must be at least 8 characters.",
        };
    }

    try {
        const decoded = jwt.verify(token, jwt_sauce as string) as jwt.JwtPayload;
        const studentNumber = Number(decoded?.student_number);
        const hashMarker = String(decoded?.hash_marker ?? "");

        if (
            decoded?.purpose !== PASSWORD_RESET_PURPOSE ||
            !Number.isInteger(studentNumber) ||
            studentNumber <= 0 ||
            !hashMarker
        ) {
            return { success: false, reason: "This reset link is invalid or expired." };
        }

        const studentAuth = await prisma.studentAuth.findUnique({
            where: { student_number: studentNumber },
            select: { hashed_password: true },
        });

        if (!studentAuth?.hashed_password || studentAuth.hashed_password !== hashMarker) {
            return { success: false, reason: "This reset link is invalid or expired." };
        }

        const hashed_pass = await bcrypt.hash(new_pass, 10);
        await prisma.studentAuth.update({
            where: { student_number: studentNumber },
            data: {
                hashed_password: hashed_pass,
                is_new: false,
            },
        });

        return { success: true };
    } catch (err) {
        console.error("Password reset failed:", err);
        return { success: false, reason: "This reset link is invalid or expired." };
    }
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
