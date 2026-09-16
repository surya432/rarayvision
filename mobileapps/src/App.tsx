import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import MainRouter from 'router/MainRouter';

const App = () => {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <NavigationContainer>
          <MainRouter />
        </NavigationContainer>
      </SafeAreaView>
    </SafeAreaProvider>
  );
};


export default App;