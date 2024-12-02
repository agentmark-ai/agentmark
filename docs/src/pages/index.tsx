import React from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import styles from './index.module.css';
import { FaGithub, FaStar } from 'react-icons/fa';

import exampleImage from '@site/static/img/example.png';
import logoImage from '@site/static/img/agent-mark-dark.png';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx(styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <Heading as="h1" className={styles.title}>
            {siteConfig.title}
          </Heading>
          <img src={logoImage} height="150px" alt="Site Logo" className={styles.logoImage} />
          <p className={styles.subtitle}>{siteConfig.tagline}</p>
          <div className={styles.buttons}>
            <a
              href="https://github.com/puzzlet-ai/agentmark"
              target="_blank"
              rel="noopener noreferrer"
              className={clsx('button', styles.button, styles.starButton)}
            >
              <FaGithub className={styles.icon} />
              <span className={styles.buttonText}>Star on GitHub</span>
              <FaStar className={styles.icon} />
            </a>
            <a
              href="/agentmark/docs/getting-started"
              className={clsx('button', styles.button)}
            >
              📖 View Docs
            </a>
          </div>
          <div className={styles.imageContainer}>
            <img src={exampleImage} alt="Example" className={styles.exampleImage} />
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  return (
    <Layout
      title="AgentMark"
      description="A declarative, extensible & composable type-safe template engine based on Markdown and JSX."
    >
      <HomepageHeader />
    </Layout>
  );
}
