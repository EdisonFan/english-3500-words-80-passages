<template>
  <div id="app-root">
    <keep-alive :include="['Passage']">
      <router-view />
    </keep-alive>
    <AIAssistant :visible="showAI" />
  </div>
</template>

<script>
import AIAssistant from './components/AIAssistant.vue';

export default {
  name: 'App',
  components: { AIAssistant },
  data() {
    return { showAI: false };
  },
  watch: {
    $route: {
      immediate: true,
      handler(route) {
        this.showAI = /^\/book\/[^/]+\/passage\//.test(route.path);
        document.body.classList.toggle('no-gloss', !this.$store.state.ui.glossOn);
        document.body.classList.toggle('show-trans', this.$store.state.ui.transOn);
      },
    },
  },
  mounted() {
    document.body.classList.toggle('no-gloss', !this.$store.state.ui.glossOn);
    document.body.classList.toggle('show-trans', this.$store.state.ui.transOn);
  },
};
</script>
