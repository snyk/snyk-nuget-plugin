This is a tampered dependency, and not the original Sammy.js.0.7.4

We altered the dependency section of the .nuspec file to introduce a group with no attributes as a test fixture:

Original dependencies section:
<dependencies>
  <dependency id="jQuery" version="1.4.1" />
</dependencies>

Altered dependencies section:
<dependencies>
  <group>
     <dependency id="jQuery" version="1.4.1" />
  </group>
</dependencies>

