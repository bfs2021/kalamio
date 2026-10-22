/**
 * Demo content for scripts/seed.js. Local development only — every account shares DEMO_PASSWORD.
 * Tags use the home page category chips (lowercased) so every chip shows posts.
 */
import { doc, p, h2, h3, ul, ol, quote, code, hr } from './seed-helpers.js';

export const DEMO_PASSWORD = 'Demo1234';

export const USERS = [
    { username: 'demo', fullname: 'Jordan Lee', email: 'demo@example.com', joinedDaysAgo: 40,
      bio: 'The shared local account. Write, break things, and reset with npm run seed -- --reset.' },
    { username: 'aarav', fullname: 'Aarav Mehta', email: 'aarav@example.com', joinedDaysAgo: 120,
      bio: 'Engineer building AI features that people actually use.', github: 'https://github.com' },
    { username: 'sofia', fullname: 'Sofia Martinez', email: 'sofia@example.com', joinedDaysAgo: 95,
      bio: 'Personal finance without the jargon.' },
    { username: 'kenji', fullname: 'Kenji Watanabe', email: 'kenji@example.com', joinedDaysAgo: 80,
      bio: 'Productivity for people who are tired of productivity advice.' },
    { username: 'amara', fullname: 'Amara Okafor', email: 'amara@example.com', joinedDaysAgo: 70,
      bio: 'Coach. Strength, walking, and fitness you can keep doing.' },
    { username: 'lena', fullname: 'Lena Fischer', email: 'lena@example.com', joinedDaysAgo: 60,
      bio: 'Writing about habits, journaling, and small changes that stick.' },
];

export const PUBLICATION = {
    owner: 'demo',
    title: 'Kalamio Dev Notes',
    slug: 'kalamio-dev-notes',
    description: 'Notes for people building Kalamio locally: tours, tips, and what the seed data is for.',
    tags: ['technology'],
};

export const ARTICLES = [
    {
        author: 'demo', publication: true, daysAgo: 1, reads: 64, colors: ['#EA580C', '#E11D48'],
        title: 'Welcome to Kalamio: A Tour for Contributors',
        des: 'Everything in this local database is fake and safe to break. Here is what the seed created and how to use it.',
        tags: ['technology', 'life'],
        likedBy: ['aarav', 'kenji', 'lena'],
        content: doc(
            p('If you can read this, your local setup works: the app, the API, MongoDB and the image storage are all talking to each other. Everything here was created by `npm run seed`, so feel free to edit, delete and break it.'),
            h2('Accounts you can log in as'),
            p('Every seeded account uses the password **Demo1234**. Log in as `demo@example.com` to write, or as another writer to test likes, comments, follows and chat between two people.'),
            ul([
                '`demo@example.com`: this account, with a draft and a publication',
                '`aarav@example.com`: AI and technology',
                '`sofia@example.com`: money',
                '`kenji@example.com`: productivity',
                '`amara@example.com`: fitness and life',
                '`lena@example.com`: self growth',
            ]),
            h2('Local services'),
            ul([
                'Emails (sign-up codes, password resets) land in the inbox at **http://localhost:8025**.',
                'Uploaded images live in local storage. Browse them at **http://localhost:9001**.',
                'Open MongoDB Compass on `mongodb://localhost:27017/kalamio` to look at the raw data.',
            ]),
            h2('Starting fresh'),
            p('Run `npm run seed -- --reset` in the `server` folder to wipe the local database and recreate all of this.'),
            quote('Found something confusing in this setup? That is a great first issue. Open one and tell us.'),
        ),
        comments: [
            { by: 'kenji', text: 'This is exactly what I needed on day one. Logging in as two users to test chat is a great tip.',
              replies: [{ by: 'demo', text: 'Glad it helped! The other accounts are there for exactly that.' }] },
        ],
    },
    {
        author: 'aarav', daysAgo: 3, reads: 912, colors: ['#4F46E5', '#06B6D4'],
        title: 'What I Learned Building My First AI Feature',
        des: 'The model was the easy part. Latency, evaluation and knowing when to say no took most of the work.',
        tags: ['ai', 'technology'],
        likedBy: ['demo', 'sofia', 'kenji', 'lena'],
        content: doc(
            p('Three months ago our team shipped a feature that summarises long support threads. The demo took a weekend. Making it good enough for real users took the rest of the quarter.'),
            h2('The model was the easy part'),
            p('Calling an API and getting a decent summary back is a solved problem. What was not solved: what happens when the thread is in two languages, when it is 40,000 words long, or when the model is confidently wrong.'),
            h2('What actually took the time'),
            ol([
                '**Evaluation.** We built a set of 200 real threads with summaries written by our support leads, and scored every change against it.',
                '**Latency.** Users waited for summaries longer than eight seconds exactly once. We started streaming the output.',
                '**Saying no.** For threads under ten messages, the feature now does nothing. Short threads did not need it, and people noticed the noise.',
            ]),
            quote('If you cannot measure whether a change made it better, you are not iterating, you are guessing.'),
            p('My advice for your first AI feature: write the evaluation set before you write the prompt.'),
        ),
        comments: [
            { by: 'lena', text: 'Writing the evaluation set first is such a good rule, and not only for AI.',
              replies: [{ by: 'aarav', text: 'Agreed. It forces you to decide what "good" means before you get attached to a solution.' }] },
            { by: 'sofia', text: 'How did you handle threads in two languages in the end?' },
        ],
    },
    {
        author: 'sofia', daysAgo: 5, reads: 640, colors: ['#059669', '#84CC16'],
        title: 'The 50/30/20 Budget, Explained Without the Guilt',
        des: 'Half for needs, a third for wants, a fifth for your future. A starting point, not a moral test.',
        tags: ['money', 'life'],
        likedBy: ['demo', 'amara', 'kenji'],
        content: doc(
            p('Most budgets fail for the same reason most diets fail: they are too strict to survive a normal month. The 50/30/20 rule works because it is loose on purpose.'),
            h2('The three buckets'),
            ul([
                '**50% needs:** rent, groceries, transport, minimum loan payments.',
                '**30% wants:** eating out, hobbies, the concert you have been looking forward to.',
                '**20% future:** savings, investing, paying debt down faster.',
            ]),
            h2('When the numbers do not fit'),
            p('In many cities, rent alone eats half of a paycheck. That does not mean you failed. Shrink the wants bucket for now, keep the future bucket above zero, and revisit it every few months.'),
            quote('A budget is a plan for your money, not a judgement of you.'),
            p('Start by tracking one month without changing anything. You cannot adjust what you have not seen.'),
        ),
        comments: [
            { by: 'amara', text: 'The "track one month without changing anything" step changed how I think about this.' },
        ],
    },
    {
        author: 'kenji', daysAgo: 6, reads: 455, colors: ['#F59E0B', '#EF4444'],
        title: 'Time Blocking: Why My Calendar Finally Works',
        des: 'My to-do list told me what to do. My calendar told me when. Only one of them was honest.',
        tags: ['productivity', 'self growth'],
        likedBy: ['demo', 'lena'],
        content: doc(
            p('For years my to-do list had forty items and my calendar had four meetings. Every evening, I was surprised the list had not shrunk.'),
            h2('A list does not know about time'),
            p('A to-do list treats a five-minute email and a two-day project the same: one line each. Time blocking makes you put each task somewhere in the week, and suddenly the week is visibly full.'),
            h3('How I do it'),
            ol([
                'Every Sunday, I block my two most important tasks first, in the mornings.',
                'Meetings and admin go in the afternoons.',
                'I leave one empty block per day. Something always runs over.',
            ]),
            p('The empty block is the part most people skip, and it is the reason the rest of the plan survives.'),
        ),
        comments: [
            { by: 'lena', text: 'The empty block per day is genius. My plans always died by Wednesday.',
              replies: [{ by: 'kenji', text: 'Mine too, until I stopped pretending nothing would go wrong.' }] },
        ],
    },
    {
        author: 'amara', daysAgo: 8, reads: 380, colors: ['#DC2626', '#F97316'],
        title: 'Strength Training After 30: Start Smaller Than You Think',
        des: 'You do not need a perfect program. You need one you will still be doing in six months.',
        tags: ['fitness', 'life'],
        likedBy: ['sofia', 'lena', 'demo'],
        content: doc(
            p('The most common mistake I see from new clients is not laziness. It is ambition. They start with five days a week and quit in week three.'),
            h2('The minimum that works'),
            ul([
                'Two sessions a week, about 40 minutes each.',
                'Four movements: a squat, a hinge, a push and a pull.',
                'Add a little weight or one more rep when the last set feels easy.',
            ]),
            p('That is it. It is not exciting, and that is exactly why it works.'),
            quote('Consistency beats intensity, every single time.'),
        ),
        comments: [],
    },
    {
        author: 'lena', daysAgo: 10, reads: 520, colors: ['#DB2777', '#F59E0B'],
        title: 'How to Build a Habit That Survives a Bad Week',
        des: 'Streaks break. Habits that last plan for the bad weeks instead of pretending they will not happen.',
        tags: ['self growth', 'productivity'],
        likedBy: ['demo', 'kenji', 'amara', 'aarav'],
        content: doc(
            p('Every habit tracker I have used works beautifully until the first week I am sick, travelling, or just tired. Then the streak breaks and the habit quietly dies with it.'),
            h2('Have a minimum version'),
            p('For every habit, decide what the smallest acceptable version is. For my writing habit, it is one sentence. On bad days, I write one sentence and count it.'),
            h2('Never miss twice'),
            p('Missing one day is normal. Missing two days in a row is the start of a new habit: not doing it. So the rule is simple: never miss twice.'),
            ol(['Pick the habit.', 'Write down its minimum version.', 'Plan what you will do the day after a miss.']),
        ),
        comments: [
            { by: 'aarav', text: '"Never miss twice" is going on a sticky note on my monitor.' },
        ],
    },
    {
        author: 'aarav', daysAgo: 12, reads: 730, colors: ['#334155', '#0EA5E9'],
        title: 'Shipping Code With Confidence: Tests That Pay Rent',
        des: 'Not every test earns its keep. Here is how I decide which ones to write, with a small example.',
        tags: ['technology', 'productivity'],
        likedBy: ['kenji', 'demo'],
        content: doc(
            p('A test suite is worth exactly as much as the bugs it stops. Some tests catch real problems every month. Others just break whenever you rename something.'),
            h2('Test behaviour, not implementation'),
            p('A good test describes what the code promises, not how it does it. Here is a test for a read-time function:'),
            code('javascript', "import { readingMinutes } from './reading.js'\n\ntest('a 1,000 word article takes about 4 minutes', () => {\n  const text = Array(1000).fill('word').join(' ')\n  expect(readingMinutes(text)).toBe(4)\n})"),
            p('If someone rewrites the function completely, this test still passes, as long as the promise holds.'),
            h2('Where I start'),
            ul(['Code that handles money or permissions.', 'Bugs that already happened once.', 'Anything I am scared to change.']),
        ),
        comments: [
            { by: 'kenji', text: '"Anything I am scared to change" is the most honest test strategy I have read.' },
        ],
    },
    {
        author: 'sofia', daysAgo: 14, reads: 590, colors: ['#0EA5E9', '#22C55E'],
        title: 'Index Funds for People Who Hate Thinking About Money',
        des: 'Buy the whole market, keep fees low, and stop checking it every day. That is most of the strategy.',
        tags: ['money'],
        likedBy: ['aarav', 'amara'],
        content: doc(
            p('If personal finance makes your eyes glaze over, good news: the most reliable long-term strategy is also the most boring one.'),
            h2('What an index fund is'),
            p('Instead of picking companies, an index fund buys a small piece of hundreds or thousands of them. When the market grows over the years, so does your money.'),
            h2('The whole strategy'),
            ol(['Pick a broad, low-fee index fund.', 'Invest a fixed amount every month, automatically.', 'Do not sell when the news is scary.']),
            p('*This is general education, not financial advice. Your situation is your own.*'),
        ),
        comments: [],
    },
    {
        author: 'kenji', daysAgo: 17, reads: 300, colors: ['#6366F1', '#A855F7'],
        title: 'The Two-Minute Rule Is Not About Two Minutes',
        des: 'It is about lowering the cost of starting until starting is boring.',
        tags: ['productivity'],
        likedBy: ['lena'],
        content: doc(
            p('The two-minute rule says: if a task takes less than two minutes, do it now. Most people stop reading there, and miss the useful half.'),
            h2('Shrink the start'),
            p('The second version applies to big habits: start with a version that takes two minutes. Want to run? Put your shoes on. Want to read more? Read one page.'),
            p('Starting is the hard part. Once you have started, continuing is surprisingly easy.'),
        ),
        comments: [],
    },
    {
        author: 'amara', daysAgo: 20, reads: 410, colors: ['#16A34A', '#0D9488'],
        title: 'Walking Is Underrated',
        des: 'No gym, no equipment, no recovery days. The most sustainable exercise is the one you already know how to do.',
        tags: ['fitness'],
        likedBy: ['sofia', 'kenji', 'demo'],
        content: doc(
            p('When people ask me for the single best change they can make, I say: walk more. It is not glamorous, and it works.'),
            h2('Why it works'),
            ul(['It is easy on your joints, so you can do it every day.', 'It clears your head. Some of my best ideas arrive on walks.', 'It fits into a day: a call, a commute, ten minutes after lunch.']),
            quote('The best exercise is the one you will actually do.'),
        ),
        comments: [
            { by: 'sofia', text: 'Walking meetings saved my sanity during busy weeks.' },
        ],
    },
    {
        author: 'lena', daysAgo: 23, reads: 350, colors: ['#0891B2', '#6366F1'],
        title: 'Journaling Prompts That Actually Get You Somewhere',
        des: '"How was your day?" gets you a weather report. These five prompts get you somewhere useful.',
        tags: ['self growth', 'life'],
        likedBy: ['amara', 'demo'],
        content: doc(
            p('I journaled for years without learning much, because I kept asking myself the same vague question: how was today?'),
            h2('Five better prompts'),
            ol([
                'What took more energy today than it should have?',
                'What am I avoiding, and why?',
                'What would make tomorrow ten percent easier?',
                'Who do I want to thank this week?',
                'What did I learn that I would have disagreed with a year ago?',
            ]),
            p('Pick one. Write for five minutes. That is enough.'),
        ),
        comments: [],
    },
    {
        author: 'aarav', daysAgo: 27, reads: 480, colors: ['#7C3AED', '#DB2777'],
        title: 'A Practical Guide to Prompting for Developers',
        des: 'Treat a prompt like a function signature: clear inputs, a clear contract, and tests.',
        tags: ['ai', 'technology'],
        likedBy: ['demo', 'kenji'],
        content: doc(
            p('Prompting is not magic words. It is writing a clear specification for a very fast, very literal collaborator.'),
            h2('Three habits that help'),
            ol([
                '**Give it the context a new teammate would need.** Who is the audience? What does good output look like?',
                '**Show an example.** One good example beats a paragraph of instructions.',
                '**Ask for a format you can check.** JSON with known fields is easier to validate than free text.',
            ]),
            p('And like any code: version your prompts, and test them against real inputs before you ship.'),
        ),
        comments: [],
    },
];

export const DRAFTS = [
    {
        author: 'demo', daysAgo: 0,
        title: 'Notes for my next article',
        content: doc(p('Ideas: what surprised me about contributing to open source, and what I wish the first issue had told me.')),
    },
];

export const TEXT_POSTS = [
    { author: 'kenji', daysAgo: 2, text: 'Hot take: most to-do apps fail because they make adding tasks easier than finishing them.' },
    { author: 'sofia', daysAgo: 4, text: 'Reminder: the best budget is the one you will still be using in March.' },
    { author: 'amara', daysAgo: 9, text: 'Took a 20 minute walk instead of scrolling after lunch. Afternoon me is very grateful.' },
];

// [follower, following]
export const FOLLOWS = [
    ['demo', 'aarav'], ['demo', 'sofia'], ['demo', 'kenji'],
    ['aarav', 'lena'], ['lena', 'aarav'], ['kenji', 'aarav'],
    ['sofia', 'kenji'], ['amara', 'lena'],
    ['lena', 'demo'], ['kenji', 'demo'], ['amara', 'demo'],
];
