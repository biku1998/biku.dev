export interface Experience {
  company: string;
  role: string;
  period: string;
  description: string;
  highlights?: string[];
  current?: boolean;
}

export const experiences: Experience[] = [
  {
    company: 'Enqurious',
    role: 'Head of Engineering and Product',
    period: 'Nov 2025 - Present',
    description:
      'Owning end-to-end product strategy and engineering delivery for the company\'s multiple platforms.',
    highlights: [
      'Lead prioritisation and execution across Product and Engineering: roadmap, delivery planning, and release coordination.',
      'Drive platform scale and user experience improvements for a product supporting 7k+ daily active users.',
    ],
    current: true,
  },
  {
    company: 'Enqurious',
    role: 'Founding Lead Product Engineer',
    period: 'Sep 2022 - Nov 2025',
    description:
      'Lead architecture and delivery for a multi-sided learning platform.',
    highlights: [
      'Re-architected the platform into two strategic components: a creator platform and a client tenant platform, enabling clearer ownership, faster iteration, and scalable delivery.',
      'Led planning and execution of v2.0, improving platform scalability and user experience while supporting growth to 5,000+ daily active users.',
      'Productised ~70% of service offerings into repeatable product features and automation, reducing manual operations and improving delivery efficiency.',
      'Built and shipped AI-powered workflow automation that reduced manual effort by 20+ hours/week.',
      'Integrated third-party cloud labs, improving hands-on learning/mentoring experiences and saving 12-14 hours/week of manual work.',
      'Mentored a team of 5 engineers through code reviews, technical specifications, and hands-on guidance across feature delivery.',
    ],
  },
  {
    company: 'Enqurious',
    role: 'Software Engineer',
    period: 'Jul 2020 - Aug 2022',
    description:
      'Delivered the company\'s first skill-focused learning product from MVP to scaled usage.',
    highlights: [
      'Built the MVP (0→1) for the company\'s first skill-focused learning experience platform.',
      'Translated business problems into shippable product increments by working closely with trainers, content creators, and learners to map real workflows into features.',
      'Shipped the first full-stack production version post-validation, resulting in a platform used by 3k+ daily active users.',
    ],
  },
  {
    company: 'Enqurious',
    role: 'Software Engineer Intern',
    period: 'May 2020 - Jul 2020',
    description:
      'Focused on prototyping and automation for learning operations.',
    highlights: [
      'Built multiple PoCs integrating Google Classroom, Slack, and Google Colab to prototype a skill-intelligence learning workflow.',
      'Automated operational workflows (reminders, score releases, key learner communications) using Slack bots + Python, reducing manual coordination overhead.',
      'Developed an internal utility web app to help teams evaluate and score learner skills more efficiently.',
      'Supported learning program operations at scale: 1,000-1,500 learners per program.',
    ],
  },
  {
    company: 'DTaiLabs',
    role: 'AI ML Intern',
    period: 'Apr 2020 - May 2020',
    description: 'Worked on Deep learning & Neural machine translation.',
  },
];
