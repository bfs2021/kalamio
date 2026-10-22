/**
 * Fill the LOCAL development database with demo users, articles, comments, likes and follows,
 * so a fresh clone shows a real-looking app instead of an empty feed.
 *
 *     npm run seed               # first time (refuses if the database already has data)
 *     npm run seed -- --reset    # wipe the local database and seed again
 *
 * Needs the services from `docker compose up -d` and server/.env copied from .env.example.
 * Refuses to run against anything that is not local (Atlas, real S3, NODE_ENV=production).
 * Every seeded account uses the password in seed-data.js (DEMO_PASSWORD).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import User, { generateAvatar } from '../Schema/User.js';
import Post from '../Schema/Post.js';
import Blog from '../Schema/Blog.js';
import TextPost from '../Schema/TextPost.js';
import Comment from '../Schema/Comment.js';
import Like from '../Schema/Like.js';
import Follow from '../Schema/Follow.js';
import Notification from '../Schema/Notification.js';
import Publication from '../Schema/Publication.js';
import { AUTH } from '../constants/auth.constants.js';
import { estimateReadTime } from '../utils/read-time.js';
import { generateUploadURL } from '../config/s3.js';
import { assertLocalTarget, bannerPng, daysAgo } from './seed-helpers.js';
import { DEMO_PASSWORD, USERS, PUBLICATION, ARTICLES, DRAFTS, TEXT_POSTS, FOLLOWS } from './seed-data.js';

const RESET = process.argv.includes('--reset');

const fail = (message) => {
    console.error(`\n❌ ${message}\n`);
    process.exit(1);
};

// Same id format as createBlog / createTextPost in the controllers.
const blogId = (title) => title.replace(/[^a-zA-Z0-9]/g, ' ').replace(/\s+/g, '-').trim() + nanoid();

// Upload through the same presigned-URL path the editor uses, so the banner URL has the real format.
const uploadBanner = async ([from, to]) => {
    const uploadURL = await generateUploadURL('image/png');
    const res = await fetch(uploadURL, {
        method: 'PUT',
        body: bannerPng(from, to),
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
    if (!res.ok) throw new Error(`storage responded ${res.status}`);
    return uploadURL.split('?')[0];
};

// Mongoose treats the timestamp fields as immutable, so backdate them with a raw write.
const backdate = (Model, items, field) => Model.collection.bulkWrite(items.map(({ _id, date }) => ({
    updateOne: { filter: { _id }, update: { $set: { [field]: date, updatedAt: date } } },
})));

const main = async () => {
    try {
        assertLocalTarget(process.env);
    } catch (err) {
        fail(err.message);
    }

    try {
        await mongoose.connect(process.env.DB_LOCATION, { serverSelectionTimeoutMS: 5000 });
    } catch {
        fail(`Can't reach MongoDB at ${process.env.DB_LOCATION}. Is \`docker compose up -d\` running?`);
    }

    if (await User.estimatedDocumentCount() > 0) {
        if (!RESET) {
            fail('The local database already has data.\n   Run `npm run seed -- --reset` to wipe it and seed again.');
        }
        // Empty every collection rather than dropping the database, so the indexes Mongoose built
        // (unique emails/usernames, feed sort indexes) stay in place for a running dev server.
        const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
        await Promise.all(collections
            .filter((c) => !c.name.startsWith('system.'))
            .map((c) => mongoose.connection.db.collection(c.name).deleteMany({})));
        console.log('🧹 Emptied the local database');
    }

    // Banners first: if storage is down, fail before writing anything to the database.
    let banners;
    try {
        banners = await Promise.all(ARTICLES.map((a) => uploadBanner(a.colors)));
    } catch (err) {
        fail(`Can't upload to local storage at ${process.env.S3_ENDPOINT} (${err.message}). Is \`docker compose up -d\` running?`);
    }
    console.log(`🖼️  Uploaded ${banners.length} banner images`);

    // ── Users ──
    const password = await bcrypt.hash(DEMO_PASSWORD, AUTH.SALT_ROUNDS);
    const users = await User.insertMany(USERS.map((u) => ({
        personal_info: {
            fullname: u.fullname, email: u.email, username: u.username, password, bio: u.bio,
            isEmailVerified: true, profile_img: generateAvatar(u.fullname),
        },
        social_links: { github: u.github || '' },
    })));
    const byName = Object.fromEntries(users.map((u, i) => [USERS[i].username, u]));
    const id = (username) => byName[username]._id;
    await backdate(User, USERS.map((u) => ({ _id: id(u.username), date: daysAgo(u.joinedDaysAgo) })), 'joinedAt');

    // ── Publication ──
    const publication = await Publication.create({
        title: PUBLICATION.title, slug: PUBLICATION.slug, description: PUBLICATION.description,
        tags: PUBLICATION.tags, owner: id(PUBLICATION.owner),
        total_posts: ARTICLES.filter((a) => a.publication).length,
    });

    // ── Articles, drafts and short posts ──
    const articles = await Blog.insertMany(ARTICLES.map((a, i) => ({
        blog_id: blogId(a.title), author: id(a.author), title: a.title, des: a.des, banner: banners[i],
        content: [a.content], tags: a.tags, draft: false, readTime: estimateReadTime(a.content, a.title, a.des),
        publication: a.publication ? publication._id : null,
        activity: { total_reads: a.reads },
    })));
    const drafts = await Blog.insertMany(DRAFTS.map((d) => ({
        blog_id: blogId(d.title), author: id(d.author), title: d.title, des: '', banner: '',
        content: [d.content], tags: [], draft: true, readTime: estimateReadTime(d.content, d.title, ''),
    })));
    const textPosts = await TextPost.insertMany(TEXT_POSTS.map((t) => ({
        blog_id: 'tp-' + nanoid(), author: id(t.author), text_content: t.text, draft: false,
    })));
    await backdate(Post, [
        ...articles.map((doc, i) => ({ _id: doc._id, date: daysAgo(ARTICLES[i].daysAgo, 3) })),
        ...drafts.map((doc, i) => ({ _id: doc._id, date: daysAgo(DRAFTS[i].daysAgo) })),
        ...textPosts.map((doc, i) => ({ _id: doc._id, date: daysAgo(TEXT_POSTS[i].daysAgo, 5) })),
    ], 'publishedAt');

    // Per-user counters, exactly as the create endpoints keep them: every post is listed in `blogs`,
    // only published articles count toward total_posts.
    await User.bulkWrite(users.map((u) => {
        const mine = (list) => list.filter((doc) => doc.author.equals(u._id));
        const published = mine(articles);
        return { updateOne: { filter: { _id: u._id }, update: { $set: {
            blogs: [...published, ...mine(drafts), ...mine(textPosts)].map((doc) => doc._id),
            'account_info.total_posts': published.length,
            'account_info.total_reads': published.reduce((sum, doc) => sum + doc.activity.total_reads, 0),
        } } } };
    }));

    // ── Follows ──
    const follows = await Follow.insertMany(FOLLOWS.map(([follower, following]) => ({
        follower: id(follower), following: id(following),
    })));
    await backdate(Follow, follows.map((f, i) => ({ _id: f._id, date: daysAgo(7 - (i % 7), i) })), 'followedAt');
    const count = (pairs, side) => pairs.reduce((acc, pair) => ({ ...acc, [pair[side]]: (acc[pair[side]] || 0) + 1 }), {});
    const following = count(FOLLOWS, 0);
    const followers = count(FOLLOWS, 1);
    await User.bulkWrite(USERS.map(({ username }) => ({ updateOne: { filter: { _id: id(username) }, update: { $set: {
        'account_info.total_following': following[username] || 0,
        'account_info.total_followers': followers[username] || 0,
    } } } })));
    const notifications = FOLLOWS.map(([follower, followed]) => ({
        type: 'follow', notification_for: id(followed), user: id(follower),
    }));

    // ── Likes ──
    const likes = ARTICLES.flatMap((a, i) => a.likedBy.map((username) => ({ user: id(username), blog: articles[i]._id })));
    await Like.insertMany(likes);
    await Post.bulkWrite(ARTICLES.map((a, i) => ({
        updateOne: { filter: { _id: articles[i]._id }, update: { $set: { 'activity.total_likes': a.likedBy.length } } },
    })));
    ARTICLES.forEach((a, i) => a.likedBy.forEach((username) => notifications.push({
        type: 'like', blog: articles[i]._id, notification_for: id(a.author), user: id(username),
    })));

    // ── Comments and replies ──
    let commentCount = 0;
    for (const [i, a] of ARTICLES.entries()) {
        const blog = articles[i];
        const base = { blog_id: blog._id, blog_author: blog.author };
        const commentIds = [];
        let k = 0; // comments land an hour apart, starting an hour after the article (always in the past)
        for (const c of a.comments) {
            const parent = await Comment.create({ ...base, comment: c.text, commented_by: id(c.by) });
            const replies = await Comment.insertMany((c.replies || []).map((r) => ({
                ...base, comment: r.text, commented_by: id(r.by), isReply: true, parent: parent._id,
            })));
            await Comment.updateOne({ _id: parent._id }, { $set: { children: replies.map((r) => r._id) } });
            await backdate(Comment, [parent, ...replies].map((doc) => ({
                _id: doc._id, date: daysAgo(a.daysAgo, 3 - ++k),
            })), 'commentedAt');
            commentIds.push(parent._id, ...replies.map((r) => r._id));
            notifications.push({ type: 'comment', blog: blog._id, notification_for: blog.author, user: id(c.by), comment: parent._id });
            replies.forEach((r, j) => notifications.push({
                type: 'reply', blog: blog._id, notification_for: parent.commented_by, user: id(c.replies[j].by),
                comment: r._id, replied_on_comment: parent._id,
            }));
        }
        commentCount += commentIds.length;
        await Post.updateOne({ _id: blog._id }, { $set: {
            comments: commentIds,
            'activity.total_comments': commentIds.length,
            'activity.total_parent_comments': a.comments.length,
        } });
    }

    // Nobody gets notified about their own actions (same rule as the controllers).
    await Notification.insertMany(notifications.filter((n) => !n.notification_for.equals(n.user)));

    console.log(`👤 ${users.length} users · 📝 ${articles.length} articles, ${drafts.length} draft, ${textPosts.length} short posts`);
    console.log(`💬 ${commentCount} comments · ❤️  ${likes.length} likes · 👥 ${follows.length} follows · 📚 1 publication`);
    console.log(`\n✅ Seeded. Open http://localhost:5173 and log in as demo@example.com / ${DEMO_PASSWORD}`);
    console.log('   (every seeded account uses the same password; see the welcome article for the list)\n');
    await mongoose.disconnect();
};

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
