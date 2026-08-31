const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function createS3Storage({ bucket, endpoint, region, accessKeyId, secretAccessKey, forcePathStyle }) {
    if (!bucket) throw new Error('LUXCLOUD_S3_BUCKET is required for the s3 storage driver');
    if (!accessKeyId || !secretAccessKey) {
        throw new Error('LUXCLOUD_S3_ACCESS_KEY_ID and LUXCLOUD_S3_SECRET_ACCESS_KEY are required');
    }

    const client = new S3Client({
        region: region || 'auto',
        endpoint: endpoint || undefined,
        forcePathStyle: Boolean(forcePathStyle),
        credentials: { accessKeyId, secretAccessKey }
    });

    async function put(key, source, meta = {}) {
        const metadata = {};
        if (meta.compression) metadata['lux-compression'] = String(meta.compression);
        if (meta.originalSize !== undefined) metadata['lux-original-size'] = String(meta.originalSize);

        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: source,
            ContentLength: meta.storedSize,
            ContentType: 'application/octet-stream',
            Metadata: metadata
        }));

        return { key, storedSize: meta.storedSize };
    }

    async function get(key) {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return { stream: result.Body, size: Number(result.ContentLength || 0) };
    }

    async function head(key) {
        try {
            const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
            return { size: Number(result.ContentLength || 0), lastModified: result.LastModified };
        } catch (err) {
            if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
            throw err;
        }
    }

    async function remove(keys) {
        let deleted = 0;
        for (let i = 0; i < keys.length; i += 1000) {
            const chunk = keys.slice(i, i + 1000);
            const result = await client.send(new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true }
            }));
            deleted += chunk.length - ((result.Errors && result.Errors.length) || 0);
        }
        return { deleted };
    }

    async function list(prefix = '') {
        const entries = [];
        let token;
        do {
            const result = await client.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                ContinuationToken: token
            }));
            for (const item of result.Contents || []) {
                entries.push({ key: item.Key, size: Number(item.Size || 0), lastModified: item.LastModified });
            }
            token = result.IsTruncated ? result.NextContinuationToken : undefined;
        } while (token);
        return entries;
    }

    async function presignGet(key, ttlSeconds = 300) {
        return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
            expiresIn: ttlSeconds
        });
    }

    return {
        driver: 's3',
        canPresign: true,
        bucket,
        put,
        get,
        head,
        remove,
        list,
        presignGet
    };
}

module.exports = { createS3Storage };
