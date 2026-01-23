export interface Experience {
  company: string;
  role: string;
  period: string;
  description: string;
  current?: boolean;
}

export const experiences: Experience[] = [
  {
    company: 'Enqurious',
    role: 'Head of Engineering and Product',
    period: 'Nov 2025 - Present',
    description:
      'Owning end-to-end product strategy and engineering delivery for the company\'s multiple platforms. Driving platform scale and user experience improvements for a product supporting 7k+ daily active users.',
    current: true,
  },
  {
    company: 'Enqurious',
    role: 'Founding Lead Product Engineer',
    period: 'Sep 2022 - Nov 2025',
    description:
      'Led architecture and delivery for a multi-sided learning platform. Re-architected the platform into strategic components, built AI-powered workflow automation, and mentored a team of 5 engineers.',
  },
  {
    company: 'Enqurious',
    role: 'Software Engineer',
    period: 'Jul 2020 - Aug 2022',
    description:
      'Delivered the company\'s first skill-focused learning product from MVP to scaled usage with 3k+ daily active users.',
  },
  {
    company: 'Enqurious',
    role: 'Software Engineer Intern',
    period: 'May 2020 - Jul 2020',
    description:
      'Built multiple PoCs integrating Google Classroom, Slack, and Google Colab. Automated operational workflows using Slack bots + Python.',
  },
  {
    company: 'DTaiLabs',
    role: 'AI ML Intern',
    period: 'Apr 2020 - May 2020',
    description: 'Worked on Deep learning & Neural machine translation.',
  },
];
