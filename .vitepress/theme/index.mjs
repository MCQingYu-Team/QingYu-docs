import DefaultTheme from 'vitepress/theme';
import IssueBoard from './IssueBoard.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('IssueBoard', IssueBoard);
  },
};
