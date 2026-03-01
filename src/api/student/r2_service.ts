import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import prisma from "../../config/prisma";

const ACC_ID = process.env.R2_ACC_ID;
const BUCKET = "aurium";

const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${ACC_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACC_KEY!,
        secretAccessKey: process.env.R2_SECRET_KEY!
    },
});

export async function generatePresignedUrl(student_number: string, ext = "jpg", mime = "image/jpeg") {
    const key =`profile_photos/${student_number}.${ext}`;
    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: mime,
        ACL: "public-read",
    });

    const upload_url = await getSignedUrl(s3, command, { expiresIn: 120 });
    const photo_url = `https://${ACC_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
    
    return { upload_url, photo_url };
}

export async function uploadPhotoUrl(student_number: string, photo_url: string) {
    const student = await prisma.student.findUnique({
        where: {
            student_number: parseInt(student_number) 
        } 
    });

    if (!student) {
        return {
            success: false,
            reason: "Student doesn't exist"
        };
    }

    await prisma.studentDetail.update({
        where: {
            id: student.id
        },
        data: {
            photo_url: photo_url
        }
    });

    return { success: true }
}